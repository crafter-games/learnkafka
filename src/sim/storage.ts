import type { Cluster } from "./cluster";
import type { Segment } from "./events";

// Log storage (World 7). Facts: docs/research/kafka-curriculum.md (Retention, compaction, tiered):
// a partition is a sequence of segments; only the active one is written; retention deletes whole
// closed segments (cleanup.policy=delete, retention.ms 7d / retention.bytes); offsets are never
// reused; compaction (cleanup.policy=compact) keeps at least the latest record per key, never in the
// active segment, offsets unchanged (gaps); tombstones (null value) delete a key and are kept for
// delete.retention.ms; tiered storage offloads closed segments to remote storage, still readable.
// Segment size is counted in records here (real Kafka: segment.bytes = 1 GiB, segment.ms = 7 days).

export type StorageOptions = {
  segmentSize: number;
  policy: "delete" | "compact";
  /** delete policy: how many segments to keep (retention.bytes analogue). Infinity = keep all. */
  retainSegments: number;
  /** tiered storage: closed segments beyond this many local ones move to remote. Infinity = off. */
  localSegments: number;
};

export const TOMBSTONE = "x-tombstone";

export class LogManager {
  opts: StorageOptions;
  /** Tombstones that already survived one cleaning pass (delete.retention.ms analogue). */
  private agedTombstones = new Set<string>();
  private remoteFrom = new Map<number, number>(); // partition → first local offset (below = remote)

  constructor(
    private cluster: Cluster,
    readonly topic: string,
    opts: Partial<StorageOptions>,
  ) {
    this.opts = { segmentSize: 4, policy: "delete", retainSegments: Infinity, localSegments: Infinity, ...opts };
    cluster.events.on((e) => {
      if (e.type === "appended" && e.topic === topic) this.afterAppend(e.record.partition);
    });
  }

  private t() {
    return this.cluster.topic(this.topic);
  }

  segments(partition: number): Segment[] {
    const t = this.t();
    const end = t.partitions[partition].length;
    const size = this.opts.segmentSize;
    const out: Segment[] = [];
    const first = Math.floor(t.logStart[partition] / size);
    const last = Math.max(first, Math.floor(Math.max(0, end - 1) / size));
    for (let i = first; i <= last; i++) {
      const start = Math.max(i * size, t.logStart[partition]);
      out.push({ index: i, start, end: Math.min((i + 1) * size, end), active: i === last, remote: start < (this.remoteFrom.get(partition) ?? 0) });
    }
    // A full active segment rolls: the next record opens a new one
    const lastSeg = out[out.length - 1];
    if (lastSeg && lastSeg.end - lastSeg.index * size >= size) {
      lastSeg.active = false;
      out.push({ index: lastSeg.index + 1, start: lastSeg.end, end: lastSeg.end, active: true, remote: false });
    }
    return out;
  }

  private emitSegments(partition: number) {
    this.cluster.events.emit({ type: "segments", topic: this.topic, partition, segments: this.segments(partition) });
  }

  private afterAppend(partition: number) {
    if (this.opts.policy === "delete") this.applyRetention(partition);
    this.applyTiering(partition);
    this.emitSegments(partition);
  }

  /** Delete the oldest CLOSED segments while there are more than retainSegments. */
  applyRetention(partition: number) {
    const t = this.t();
    const segs = this.segments(partition);
    let excess = segs.length - this.opts.retainSegments;
    const removed: number[] = [];
    for (const s of segs) {
      if (excess <= 0 || s.active) break;
      for (let o = s.start; o < s.end; o++) removed.push(o);
      t.logStart[partition] = s.end;
      excess--;
    }
    if (removed.length) {
      this.cluster.events.emit({ type: "recordsRemoved", topic: this.topic, partition, offsets: removed, reason: "retention" });
      this.emitSegments(partition);
    }
  }

  setRetention(segments: number) {
    this.opts.retainSegments = segments;
    for (let p = 0; p < this.t().numPartitions; p++) this.applyRetention(p);
  }

  private applyTiering(partition: number) {
    if (!Number.isFinite(this.opts.localSegments)) return;
    const closed = this.segments(partition).filter((s) => !s.active);
    const toRemote = closed.slice(0, Math.max(0, closed.length - this.opts.localSegments));
    const boundary = toRemote.length ? toRemote[toRemote.length - 1].end : 0;
    if (boundary > (this.remoteFrom.get(partition) ?? 0)) this.remoteFrom.set(partition, boundary);
  }

  isRemote(partition: number, offset: number) {
    return offset < (this.remoteFrom.get(partition) ?? 0);
  }

  /**
   * One cleaner pass (cleanup.policy=compact): in closed segments, drop records superseded by a
   * newer record with the same key; drop tombstones that already survived a previous pass.
   */
  clean(partition = 0): number {
    const t = this.t();
    const log = t.partitions[partition];
    const activeStart = this.segments(partition).find((s) => s.active)?.start ?? log.length;
    const latest = new Map<string, number>();
    for (const r of log) if (r.key !== null && !t.isGone(partition, r.offset)) latest.set(r.key, r.offset);
    const removed: number[] = [];
    for (const r of log) {
      if (r.offset >= activeStart || t.isGone(partition, r.offset) || r.key === null) continue;
      const superseded = latest.get(r.key) !== r.offset;
      const id = `${partition}/${r.offset}`;
      const oldTombstone = r.headers[TOMBSTONE] === "1" && this.agedTombstones.has(id);
      if (superseded || oldTombstone) {
        t.removed[partition].add(r.offset);
        removed.push(r.offset);
      } else if (r.headers[TOMBSTONE] === "1") this.agedTombstones.add(id);
    }
    if (removed.length) this.cluster.events.emit({ type: "recordsRemoved", topic: this.topic, partition, offsets: removed, reason: "compaction" });
    this.emitSegments(partition);
    return removed.length;
  }

  /** Current value per key as a consumer reading the whole log would rebuild it (tombstone = deleted). */
  table(partition = 0): Map<string, string> {
    const t = this.t();
    const out = new Map<string, string>();
    for (const r of t.partitions[partition]) {
      if (r.key === null || t.isGone(partition, r.offset)) continue;
      if (r.headers[TOMBSTONE] === "1") out.delete(r.key);
      else out.set(r.key, r.value);
    }
    return out;
  }
}
