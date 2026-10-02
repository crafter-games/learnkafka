import type { Cluster } from "./cluster";

// World 9 — share groups (KIP-932, production-ready in Kafka 4.2) and performance. Facts:
// docs/research/kafka-curriculum.md (World 9 — Queues & Performance): consumers in a share group
// take records from the same partitions cooperatively, each record is acquired under a lock
// (group.share.record.lock.duration.ms, 30 s by default; the game shortens it), acknowledged with
// ACCEPT (done), RELEASE (put back, redelivered) or REJECT (unprocessable → archived); a record whose
// delivery count reaches the limit (group.share.delivery.count.limit, 5) is archived. No per-key
// ordering, and no tie between the number of consumers and partitions. A classic group instead
// gives each partition to one member, so extra members sit idle.

export type RecordState = "available" | "acquired" | "acked" | "archived";
export type ShareRecord = { id: string; partition: number; offset: number; key: string | null; state: RecordState; deliveries: number; owner: string | null; lockUntil: number };
export type ShareMember = { id: string; alive: boolean; holding: string | null; doneAt: number };
export type ShareOptions = { processMs: number; lockMs: number; deliveryLimit: number; poisonKeys: string[] };
export type GroupType = "classic" | "share";

export class ShareGroup {
  mode: GroupType;
  onFailure: "release" | "reject" = "release";
  readonly records = new Map<string, ShareRecord>();
  readonly members: ShareMember[] = [];
  processed = 0;
  archived = 0;
  redeliveries = 0;
  /** Records finished per second, smoothed. */
  rate = 0;
  private recent: number[] = [];
  private seq = 0;

  constructor(
    private cluster: Cluster,
    readonly topic: string,
    mode: GroupType,
    readonly opts: ShareOptions,
    private now: () => number = () => Date.now(),
  ) {
    this.mode = mode;
  }

  join() {
    const m = { id: `R${++this.seq}`, alive: true, holding: null, doneAt: 0 };
    this.members.push(m);
    return m;
  }

  get alive() {
    return this.members.filter((m) => m.alive);
  }

  /** Crash a member that is holding a record: its lock simply runs out later. */
  crash() {
    const m = this.alive.find((x) => x.holding) ?? this.alive[0];
    if (m) m.alive = false;
  }

  /** Classic groups: member i owns partition i (range-style); extra members get nothing. */
  assignment(m: ShareMember): number[] {
    const n = this.cluster.topic(this.topic).numPartitions;
    const alive = this.alive;
    const i = alive.indexOf(m);
    if (i < 0) return [];
    const parts: number[] = [];
    for (let p = 0; p < n; p++) if (p % alive.length === i) parts.push(p);
    return parts;
  }

  /** Members that can't get any work (classic groups with more members than partitions). */
  get idle() {
    return this.mode === "classic" ? this.alive.filter((m) => this.assignment(m).length === 0).length : 0;
  }

  private sync() {
    const t = this.cluster.topic(this.topic);
    t.partitions.forEach((log, p) =>
      log.forEach((r) => {
        const id = `${p}/${r.offset}`;
        if (!this.records.has(id)) this.records.set(id, { id, partition: p, offset: r.offset, key: r.key, state: "available", deliveries: 0, owner: null, lockUntil: 0 });
      }),
    );
  }

  /** Next record a member may take: share = any available one; classic = in order on its partitions. */
  private next(m: ShareMember): ShareRecord | undefined {
    const all = [...this.records.values()];
    if (this.mode === "share") return all.filter((r) => r.state === "available").sort((a, b) => a.offset - b.offset || a.partition - b.partition)[0];
    for (const p of this.assignment(m)) {
      const inPart = all.filter((r) => r.partition === p).sort((a, b) => a.offset - b.offset);
      const head = inPart.find((r) => r.state !== "acked" && r.state !== "archived");
      if (head && head.state === "available") return head;
    }
    return undefined;
  }

  tick() {
    const now = this.now();
    this.sync();
    // Expired locks: the record goes back to available (or is archived at the delivery limit)
    for (const r of this.records.values()) {
      if (r.state !== "acquired" || r.lockUntil > now) continue;
      const owner = this.members.find((m) => m.id === r.owner);
      if (owner && owner.alive) continue;
      this.putBack(r);
    }
    for (const m of this.members) {
      if (!m.alive) continue;
      const held = m.holding ? this.records.get(m.holding) : undefined;
      if (held && now >= m.doneAt) {
        m.holding = null;
        if (held.key !== null && this.opts.poisonKeys.includes(held.key)) {
          if (this.onFailure === "reject") this.archive(held);
          else this.putBack(held);
        } else {
          held.state = "acked";
          held.owner = null;
          this.processed++;
          this.recent.push(now);
        }
      }
      if (!m.holding) {
        const r = this.next(m);
        if (r) {
          r.state = "acquired";
          r.owner = m.id;
          r.deliveries++;
          if (r.deliveries > 1) this.redeliveries++;
          r.lockUntil = now + this.opts.lockMs;
          m.holding = r.id;
          m.doneAt = now + this.opts.processMs;
        }
      }
    }
    this.recent = this.recent.filter((t) => now - t < 3000);
    this.rate = this.recent.length / 3;
  }

  private putBack(r: ShareRecord) {
    r.owner = null;
    if (r.deliveries >= this.opts.deliveryLimit) this.archive(r);
    else r.state = "available";
  }

  private archive(r: ShareRecord) {
    r.state = "archived";
    r.owner = null;
    this.archived++;
  }
}

// ---------------------------------------------------------------- performance & quotas

export type PerfSettings = { sequential: boolean; zeroCopy: boolean; tls: boolean; batch: number };

/**
 * Illustrative broker throughput in MB/s. The orders of magnitude follow the Kafka design docs
 * (linear disk writes ~600 MB/s vs ~100 kB/s random on the same disks); the copy and batching
 * factors are game numbers. TLS encrypts inside the JVM, so it switches zero-copy (sendfile) off.
 */
export function throughput(s: PerfSettings): number {
  const disk = s.sequential ? 600 : 0.1;
  const copy = s.zeroCopy && !s.tls ? 1 : 0.62;
  const batching = s.batch >= 100 ? 1 : s.batch >= 10 ? 0.55 : 0.12;
  const v = disk * copy * batching;
  return v < 1 ? Math.round(v * 100) / 100 : Math.round(v * 10) / 10;
}

/**
 * A broker shares its capacity between clients. A byte-rate quota caps a client: the broker
 * computes a throttle time and delays its responses, so it simply slows down (nothing is dropped).
 */
export function shareCapacity(capacity: number, clients: { id: string; demand: number; quota?: number }[]) {
  const capped = clients.map((c) => ({ ...c, want: Math.min(c.demand, c.quota ?? Infinity) }));
  const out = new Map<string, { got: number; throttleMs: number }>();
  // Over capacity, clients get bandwidth in proportion to what they push: the noisiest wins
  const total = capped.reduce((n, c) => n + c.want, 0);
  const k = total > capacity ? capacity / total : 1;
  for (const c of capped) {
    const throttled = c.quota !== undefined && c.demand > c.quota;
    out.set(c.id, { got: Math.round(c.want * k), throttleMs: throttled ? Math.round(((c.demand - c.quota!) / c.quota!) * 1000) : 0 });
  }
  return out;
}
