import type { Cluster } from "./cluster";

// Replication (World 3 preview, World 5 in depth). One partition replicated on several brokers;
// each replica is shown as its own single-partition "topic" lane on the stage.
// Facts (docs/research/kafka-curriculum.md, Replication & KRaft): a leader takes writes, followers
// fetch from it; the ISR is the set of caught-up replicas (replica.lag.time.max.ms, 30 s by default);
// a record is committed once every ISR member has it and consumers read up to the high watermark;
// acks=all + min.insync.replicas rejects writes with NotEnoughReplicas when the ISR is too small;
// unclean.leader.election.enable=false by default; KRaft controllers (a Raft quorum) run elections.

export type Acks = "0" | "1" | "all";
export type Receipt = { n: number; key: string; offset: number; status: "pending" | "acked" | "lost" | "rejected" };

export type ReplicaOptions = {
  acks: Acks;
  copyMs?: number;
  /** A follower that hasn't caught up for this long drops out of the ISR (slowed down for the game). */
  isrLagMs?: number;
  minInsync?: number;
  unclean?: boolean;
  /** Controller nodes (KRaft). Elections need a majority of them alive. */
  controllers?: string[];
};

export class ReplicaSet {
  leader: string | null;
  acks: Acks;
  minInsync: number;
  unclean: boolean;
  readonly down = new Set<string>();
  readonly slow = new Set<string>();
  readonly isr: Set<string>;
  readonly receipts: Receipt[] = [];
  readonly controllers: string[];
  readonly controllersDown = new Set<string>();
  activeController: string | null;
  private caughtUpAt = new Map<string, number>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private lostCount = 0;
  private copyMs: number;
  private isrLagMs: number;

  constructor(
    private cluster: Cluster,
    readonly replicas: string[],
    opts: ReplicaOptions | Acks,
    private now: () => number = () => Date.now(),
  ) {
    const o: ReplicaOptions = typeof opts === "string" ? { acks: opts } : opts;
    this.acks = o.acks;
    this.copyMs = o.copyMs ?? 900;
    this.isrLagMs = o.isrLagMs ?? 60_000;
    this.minInsync = o.minInsync ?? 1;
    this.unclean = o.unclean ?? false;
    this.controllers = o.controllers ?? [];
    this.activeController = this.controllers[0] ?? null;
    this.leader = replicas[0];
    this.isr = new Set(replicas);
    for (const r of replicas) this.caughtUpAt.set(r, this.now());
  }

  private log(replica: string) {
    return this.cluster.topic(replica).partitions[0];
  }

  /** Followers fetch one record per tick from the leader; the ISR and high watermark follow. */
  start() {
    this.timer = setInterval(() => this.tick(), this.copyMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  tick() {
    if (!this.leader) return;
    const leaderLog = this.log(this.leader);
    for (const r of this.replicas) {
      if (r === this.leader || this.down.has(r)) continue;
      const mine = this.log(r);
      if (!this.slow.has(r)) {
        const next = leaderLog[mine.length];
        if (next) this.cluster.produce(r, next.key, next.value, { ...next.headers, "x-copy-from": this.leader }, 0);
      }
      if (this.log(r).length >= leaderLog.length) this.caughtUpAt.set(r, this.now());
    }
    this.caughtUpAt.set(this.leader, this.now());
    this.updateIsr();
    this.settle();
  }

  private updateIsr() {
    const before = [...this.isr].sort().join();
    const leaderLen = this.leader ? this.log(this.leader).length : 0;
    for (const r of this.replicas) {
      if (this.down.has(r)) {
        this.isr.delete(r);
        continue;
      }
      const caughtUp = this.log(r).length >= leaderLen;
      if (caughtUp) this.isr.add(r);
      else if (this.now() - (this.caughtUpAt.get(r) ?? 0) > this.isrLagMs) this.isr.delete(r);
    }
    const after = [...this.isr].sort().join();
    if (before !== after) this.cluster.events.emit({ type: "isrChanged", isr: [...this.isr] });
    this.cluster.events.emit({ type: "highWatermark", topic: this.leader ?? "", offset: this.highWatermark() });
  }

  /** Records every in-sync replica has: consumers can read up to here. */
  highWatermark(): number {
    if (!this.leader) return 0;
    return Math.min(...[...this.isr].filter((r) => !this.down.has(r)).map((r) => this.log(r).length));
  }

  /** Re-evaluate pending receipts against the acks setting. */
  private settle() {
    if (!this.leader) return;
    for (const rc of this.receipts) {
      if (rc.status !== "pending") continue;
      if (this.acks === "1" && this.log(this.leader).length > rc.offset) rc.status = "acked";
      if (this.acks === "all" && [...this.isr].every((r) => this.log(r).length > rc.offset)) rc.status = "acked";
    }
  }

  send(key: string, n: number) {
    if (!this.leader || this.down.has(this.leader)) {
      this.receipts.push({ n, key, offset: -1, status: "rejected" });
      this.cluster.events.emit({ type: "produceRejected", reason: "offline" });
      return;
    }
    // acks=all refuses to write when too few replicas are in sync (NotEnoughReplicas)
    if (this.acks === "all" && this.isr.size < this.minInsync) {
      this.receipts.push({ n, key, offset: -1, status: "rejected" });
      this.cluster.events.emit({ type: "produceRejected", reason: "notEnoughReplicas" });
      return;
    }
    const record = this.cluster.produce(this.leader, key, `#${n}`, {}, 0);
    this.receipts.push({ n, key, offset: record.offset, status: this.acks === "0" ? "acked" : "pending" });
    this.settle();
  }

  get hasQuorum() {
    if (!this.controllers.length) return true;
    return this.controllers.length - this.controllersDown.size > this.controllers.length / 2;
  }

  /** A broker dies. If it led the partition, the active controller elects a new leader. */
  crash(broker: string) {
    if (this.down.has(broker)) return;
    this.down.add(broker);
    this.isr.delete(broker);
    this.cluster.events.emit({ type: "brokerDown", topic: broker });
    if (broker === this.leader) this.elect();
    else this.updateIsr();
  }

  crashLeader() {
    if (this.leader) this.crash(this.leader);
  }

  revive(broker: string) {
    if (!this.down.delete(broker)) return;
    this.caughtUpAt.set(broker, this.now());
    this.cluster.events.emit({ type: "brokerUp", topic: broker });
    if (!this.leader) {
      // The partition was offline: a returning replica that holds everything ever written was the
      // last in-sync one, so it can safely lead again (what Kafka/ELR does)
      const most = Math.max(...this.replicas.map((r) => this.log(r).length));
      if (this.log(broker).length >= most) this.isr.add(broker);
      this.elect();
    }
  }

  private elect() {
    const old = this.leader;
    this.leader = null;
    if (!this.hasQuorum) {
      // No controller majority: nobody can run the election, the partition stays offline
      this.cluster.events.emit({ type: "partitionOffline", reason: "noQuorum" });
      return;
    }
    const alive = this.replicas.filter((r) => !this.down.has(r) && r !== old);
    let candidates = alive.filter((r) => this.isr.has(r));
    if (!candidates.length && this.unclean) candidates = alive; // unclean: an out-of-sync replica may lead
    if (!candidates.length) {
      this.cluster.events.emit({ type: "partitionOffline", reason: "noIsr" });
      return;
    }
    const next = candidates.reduce((a, b) => (this.log(b).length > this.log(a).length ? b : a));
    this.leader = next;
    const kept = this.log(next).length;
    let lost = 0;
    for (const rc of this.receipts) {
      if (rc.offset < kept || rc.status === "lost" || rc.status === "rejected") continue;
      if (rc.status === "acked") {
        // The producer was told "saved" but the new leader never got it: silent data loss
        rc.status = "lost";
        lost++;
      } else {
        // Never acknowledged: the producer simply retries against the new leader
        rc.offset = this.cluster.produce(next, rc.key, `#${rc.n}`, {}, 0).offset;
      }
    }
    this.lostCount += lost;
    this.cluster.events.emit({ type: "leaderElected", topic: next, lost });
    this.updateIsr();
    this.settle();
  }

  get lostAcked() {
    return this.lostCount;
  }

  /** KRaft: an active controller dies; the remaining majority elects another one. */
  crashController(name = this.activeController ?? undefined) {
    if (!name || this.controllersDown.has(name)) return;
    this.controllersDown.add(name);
    this.cluster.events.emit({ type: "controllerDown", name });
    if (name === this.activeController) {
      this.activeController = this.hasQuorum ? (this.controllers.find((c) => !this.controllersDown.has(c)) ?? null) : null;
      this.cluster.events.emit({ type: "controllerElected", name: this.activeController });
    }
  }
}
