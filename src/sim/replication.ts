import type { Cluster } from "./cluster";

// acks and replication (World 3 preview of World 5). One partition replicated on three
// brokers; each replica is shown as its own single-partition "topic" lane on the stage.
// Facts: acks=0/1/all (default all since Kafka 3.0); with acks=all the leader waits for
// every in-sync replica before acknowledging.

export type Acks = "0" | "1" | "all";
export type Receipt = { n: number; key: string; offset: number; status: "pending" | "acked" | "lost" };

export class ReplicaSet {
  leader: string;
  readonly down = new Set<string>();
  readonly receipts: Receipt[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private cluster: Cluster,
    readonly replicas: string[],
    public acks: Acks,
    private copyMs = 900,
  ) {
    this.leader = replicas[0];
  }

  private log(replica: string) {
    return this.cluster.topic(replica).partitions[0];
  }

  /** Followers copy one record per tick from the leader (a fetch, like real replication). */
  start() {
    this.timer = setInterval(() => {
      const leaderLog = this.log(this.leader);
      for (const r of this.replicas) {
        if (r === this.leader || this.down.has(r)) continue;
        const mine = this.log(r);
        const next = leaderLog[mine.length];
        if (next) this.cluster.produce(r, next.key, next.value, { ...next.headers, "x-copy-from": this.leader }, 0);
      }
      this.settle();
    }, this.copyMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  private inSync() {
    return this.replicas.filter((r) => !this.down.has(r));
  }

  /** Re-evaluate pending receipts against the acks setting. */
  private settle() {
    for (const rc of this.receipts) {
      if (rc.status !== "pending") continue;
      const copies = this.inSync().filter((r) => this.log(r).length > rc.offset).length;
      if (this.acks === "1" && this.log(this.leader).length > rc.offset) rc.status = "acked";
      if (this.acks === "all" && copies === this.inSync().length) rc.status = "acked";
    }
  }

  send(key: string, n: number) {
    if (this.down.has(this.leader)) return;
    const record = this.cluster.produce(this.leader, key, `#${n}`, {}, 0);
    this.receipts.push({ n, key, offset: record.offset, status: this.acks === "0" ? "acked" : "pending" });
    this.settle();
  }

  /** The leader's broker dies; the most caught-up follower takes over. Acked records it lacks are lost. */
  crashLeader() {
    const old = this.leader;
    this.down.add(old);
    this.cluster.events.emit({ type: "brokerDown", topic: old });
    const candidates = this.inSync();
    if (!candidates.length) return;
    const next = candidates.reduce((a, b) => (this.log(b).length > this.log(a).length ? b : a));
    this.leader = next;
    const kept = this.log(next).length;
    let lost = 0;
    for (const rc of this.receipts) {
      if (rc.offset < kept || rc.status === "lost") continue;
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
    this.settle();
  }

  private lostCount = 0;
  get lostAcked() {
    return this.lostCount;
  }
}
