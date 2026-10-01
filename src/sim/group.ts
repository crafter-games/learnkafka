import type { Cluster } from "./cluster";

// Consumer groups (World 4). Facts: docs/research/kafka-curriculum.md (Consumers & Groups):
// pull-based poll loop (max.poll.records=500), one partition → one member per group,
// rebalances (classic eager / cooperative, KIP-848 "consumer" protocol), committed offsets in
// __consumer_offsets = next record to read, auto.offset.reset=latest, lag = log end − committed.

export type Protocol = "eager" | "cooperative" | "consumer";
export type CommitMode = "auto" | "before" | "after";

export const MEMBER_COLORS = ["#2fb5a3", "#8b5cf6", "#e0679a", "#3b82f6", "#d97706", "#0ea5e9"];

export type Member = { id: string; partitions: number[]; color: string; alive: boolean };

export type GroupOptions = {
  protocol: Protocol;
  commit: CommitMode;
  maxPollRecords: number;
  /** Time to process one record. */
  processMs: number;
  /** Fixed cost of one poll round trip. */
  pollMs: number;
  autoCommitMs: number;
  rebalanceMs: number;
  offsetReset: "earliest" | "latest";
};

export const DEFAULT_GROUP: GroupOptions = {
  protocol: "eager",
  commit: "after",
  maxPollRecords: 3,
  processMs: 300,
  pollMs: 300,
  autoCommitMs: 5000,
  rebalanceMs: 1800,
  offsetReset: "earliest",
};

type Work = { partition: number; offset: number };
type Runner = { batch: Work[]; busy: boolean; timer: ReturnType<typeof setTimeout> | null };

export class GroupSim {
  readonly members: Member[] = [];
  readonly committed: number[];
  readonly paused = new Set<number>();
  /** Offsets processed per partition, counting repeats (for duplicates). */
  readonly processed: Map<number, number>[];
  duplicates = 0;
  processedCount = 0;
  lastPaused = 0;
  private runners = new Map<string, Runner>();
  private autoTimer: ReturnType<typeof setInterval> | null = null;
  private seq = 0;
  private rebalanceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private cluster: Cluster,
    readonly group: string,
    readonly topic: string,
    public opts: GroupOptions,
  ) {
    const n = this.partitions;
    this.processed = Array.from({ length: n }, () => new Map());
    // auto.offset.reset applies only when a group has no committed offset yet
    const ends = cluster.topic(topic).endOffsets();
    this.committed = Array.from({ length: n }, (_, p) => (opts.offsetReset === "latest" ? ends[p] : 0));
    for (let p = 0; p < n; p++) cluster.seek(group, topic, p, this.committed[p]);
    this.autoTimer = setInterval(() => {
      if (this.opts.commit === "auto") this.commitProcessed();
    }, opts.autoCommitMs);
  }

  get partitions() {
    return this.cluster.topic(this.topic).numPartitions;
  }

  get alive() {
    return this.members.filter((m) => m.alive);
  }

  /** Lag as Kafka reports it: log-end offset − committed offset. */
  lag(): number {
    const ends = this.cluster.topic(this.topic).endOffsets();
    return ends.reduce((n, end, p) => n + Math.max(0, end - (this.committed[p] ?? 0)), 0);
  }

  /** Records that were committed past but never processed (at-most-once loss). */
  lost(): number {
    let n = 0;
    for (let p = 0; p < this.committed.length; p++) for (let o = 0; o < this.committed[p]; o++) if (!this.processed[p]?.has(o)) n++;
    return n;
  }

  join(): Member {
    const id = `C${++this.seq}`;
    const m: Member = { id, partitions: [], color: MEMBER_COLORS[(this.seq - 1) % MEMBER_COLORS.length], alive: true };
    this.members.push(m);
    this.runners.set(id, { batch: [], busy: false, timer: null });
    this.rebalance();
    return m;
  }

  leave(id = this.alive.at(-1)?.id) {
    const m = this.members.find((x) => x.id === id && x.alive);
    if (!m) return;
    m.alive = false;
    this.stopRunner(id!);
    // A clean leave commits what it processed first
    this.commitProcessed();
    this.rebalance();
  }

  /** A member dies mid-work: nothing more is committed; its partitions restart from the last commit. */
  crash(id = this.alive[0]?.id) {
    const m = this.members.find((x) => x.id === id && x.alive);
    if (!m) return;
    m.alive = false;
    this.stopRunner(id!);
    for (const p of m.partitions) this.cluster.seek(this.group, this.topic, p, this.committed[p]);
    this.cluster.events.emit({ type: "memberDown", group: this.group, member: m.id });
    this.rebalance();
  }

  private stopRunner(id: string) {
    const r = this.runners.get(id);
    if (r?.timer) clearTimeout(r.timer);
    this.runners.delete(id);
  }

  /** Who should own what: range for eager, sticky (keep owners, rebalance counts) otherwise. */
  private target(): Map<string, number[]> {
    const alive = this.alive;
    const out = new Map<string, number[]>(alive.map((m) => [m.id, []]));
    if (!alive.length) return out;
    const n = this.partitions;
    if (this.opts.protocol === "eager") {
      // RangeAssignor: contiguous chunks, the first members get the remainder
      const per = Math.floor(n / alive.length);
      let extra = n % alive.length;
      let p = 0;
      for (const m of alive) {
        const count = per + (extra-- > 0 ? 1 : 0);
        for (let i = 0; i < count; i++) out.get(m.id)!.push(p++);
      }
      return out;
    }
    const quota = (i: number) => Math.floor(n / alive.length) + (i < n % alive.length ? 1 : 0);
    const free: number[] = [];
    for (let p = 0; p < n; p++) {
      const owner = alive.find((m) => m.partitions.includes(p));
      if (owner) out.get(owner.id)!.push(p);
      else free.push(p);
    }
    // Trim members above quota, then hand free partitions to members below quota
    alive.forEach((m, i) => {
      const mine = out.get(m.id)!;
      while (mine.length > quota(i)) free.push(mine.pop()!);
    });
    alive.forEach((m, i) => {
      const mine = out.get(m.id)!;
      while (mine.length < quota(i) && free.length) mine.push(free.shift()!);
    });
    return out;
  }

  rebalance() {
    const target = this.target();
    const moved = new Set<number>();
    for (let p = 0; p < this.partitions; p++) {
      const before = this.members.find((m) => m.alive && m.partitions.includes(p))?.id;
      const after = [...target].find(([, ps]) => ps.includes(p))?.[0];
      if (before !== after) moved.add(p);
    }
    // Eager stops the world; cooperative and KIP-848 only pause the partitions that move.
    const pause = this.opts.protocol === "eager" ? [...Array(this.partitions).keys()] : [...moved];
    const duration = this.opts.protocol === "consumer" ? this.opts.rebalanceMs / 2 : this.opts.protocol === "cooperative" ? this.opts.rebalanceMs : this.opts.rebalanceMs;
    this.lastPaused = pause.length;
    for (const p of pause) this.paused.add(p);
    if (this.opts.protocol === "eager") for (const m of this.members) m.partitions = [];
    for (const m of this.members) if (m.alive && this.opts.protocol !== "eager") m.partitions = m.partitions.filter((p) => !moved.has(p));
    this.emitAssignment();
    if (this.rebalanceTimer) clearTimeout(this.rebalanceTimer);
    this.rebalanceTimer = setTimeout(() => {
      for (const m of this.alive) m.partitions = target.get(m.id) ?? [];
      // A partition that changes owner resumes from the last committed offset
      for (const p of moved) this.cluster.seek(this.group, this.topic, p, this.committed[p]);
      this.paused.clear();
      this.emitAssignment();
      for (const m of this.alive) this.poll(m.id);
    }, duration);
  }

  private emitAssignment() {
    this.cluster.events.emit({
      type: "assignment",
      group: this.group,
      topic: this.topic,
      members: this.members.filter((m) => m.alive).map((m) => ({ id: m.id, partitions: [...m.partitions], color: m.color })),
      paused: [...this.paused],
    });
  }

  /** One poll: fetch up to max.poll.records from owned, unpaused partitions, then process them. */
  private poll(id: string) {
    const r = this.runners.get(id);
    const m = this.members.find((x) => x.id === id);
    if (!r || !m?.alive || r.busy) return;
    r.busy = true;
    r.timer = setTimeout(() => {
      const batch: Work[] = [];
      const owned = m.partitions.filter((p) => !this.paused.has(p));
      let progress = true;
      while (batch.length < this.opts.maxPollRecords && progress) {
        progress = false;
        for (const p of owned) {
          if (batch.length >= this.opts.maxPollRecords) break;
          const rec = this.cluster.fetch(this.group, this.topic, p, m.id);
          if (rec) {
            batch.push({ partition: p, offset: rec.offset });
            progress = true;
          }
        }
      }
      if (this.opts.commit === "before") for (const w of batch) this.commit(w.partition, w.offset + 1);
      r.batch = batch;
      this.processNext(id);
    }, this.opts.pollMs);
  }

  private processNext(id: string) {
    const r = this.runners.get(id);
    if (!r) return;
    const w = r.batch.shift();
    if (!w) {
      r.busy = false;
      this.poll(id);
      return;
    }
    r.timer = setTimeout(() => {
      if (!this.runners.has(id)) return;
      const seen = this.processed[w.partition].get(w.offset) ?? 0;
      if (seen > 0) this.duplicates++;
      this.processed[w.partition].set(w.offset, seen + 1);
      this.processedCount++;
      this.cluster.events.emit({ type: "processed", group: this.group, member: id, partition: w.partition, offset: w.offset, duplicate: seen > 0 });
      if (this.opts.commit === "after") this.commit(w.partition, w.offset + 1);
      this.processNext(id);
    }, this.opts.processMs);
  }

  /** Commit = store the NEXT offset to read for a partition (never moves backwards here). */
  private commit(partition: number, next: number) {
    if (next <= this.committed[partition]) return;
    this.committed[partition] = next;
    this.cluster.events.emit({ type: "committed", group: this.group, topic: this.topic, partition, offset: next });
  }

  private commitProcessed() {
    for (let p = 0; p < this.partitions; p++) {
      let next = this.committed[p];
      while (this.processed[p]?.has(next)) next++;
      this.commit(p, next);
    }
  }

  /** Partitions were added: track them and spread them over the members. */
  grow() {
    while (this.committed.length < this.partitions) {
      this.committed.push(0);
      this.processed.push(new Map());
    }
    this.rebalance();
  }

  /** Kick idle members (call after producing so waiting members poll again). */
  wake() {
    for (const m of this.alive) this.poll(m.id);
  }

  stop() {
    for (const id of [...this.runners.keys()]) this.stopRunner(id);
    if (this.autoTimer) clearInterval(this.autoTimer);
    if (this.rebalanceTimer) clearTimeout(this.rebalanceTimer);
  }
}
