import type { Cluster } from "./cluster";
import type { SimRecord } from "./events";
import { TOMBSTONE } from "./storage";

// World 8 — Streams & Connect. Facts: docs/research/kafka-curriculum.md (World 10 — Ecosystem):
// Connect source connectors copy an external system into topics and keep their own source
// position in a Kafka topic (offset.storage.topic, "connect-offsets" by convention) that is flushed
// periodically (offset.flush.interval.ms, 60 s by default), so a crashed task resumes from the last
// flush and may re-send rows (at-least-once unless exactly-once source support is on, KIP-618).
// Kafka Streams is a library, not a cluster: application.id doubles as the consumer group id; a
// KStream is every event (inserts), a KTable keeps the latest value per key (upsert, null = delete);
// state stores are backed by compacted changelog topics and restored from them after a failure;
// windowed aggregations use event time, and a record later than window end + grace is dropped.

const isTombstone = (r: SimRecord) => r.headers[TOMBSTONE] !== undefined || r.value === "";

/** KStream view: every record, in order (the newest last). */
export function streamView(cluster: Cluster, topic: string): SimRecord[] {
  const t = cluster.topic(topic);
  return t.partitions.flat().sort((a, b) => a.timestamp - b.timestamp || a.offset - b.offset);
}

/** KTable view: the latest value per key; a tombstone (null value) deletes the key. */
export function tableView(cluster: Cluster, topic: string): Map<string, string> {
  const table = new Map<string, string>();
  for (const r of streamView(cluster, topic)) {
    if (r.key === null) continue;
    if (isTombstone(r)) table.delete(r.key);
    else table.set(r.key, r.value);
  }
  return table;
}

export type Row = { id: string; value: string };

/**
 * A JDBC-style source connector in incrementing mode: one task copies new rows of a database table
 * into a topic and flushes its position to the offsets topic every `flushEvery` rows.
 */
export class SourceConnector {
  readonly table: Row[] = [];
  /** Rows the running task has copied (in memory, lost on a crash). */
  position = 0;
  running = true;
  duplicates = 0;
  private sent = new Set<number>();

  constructor(
    private cluster: Cluster,
    readonly name: string,
    readonly topic: string,
    readonly offsetsTopic: string,
    readonly flushEvery = 3,
    rows: Row[] = [],
  ) {
    this.table.push(...rows);
  }

  insert(row: Row) {
    this.table.push(row);
  }

  /** The position last flushed to the offsets topic, read back from the topic itself. */
  committed(): number {
    const last = streamView(this.cluster, this.offsetsTopic).filter((r) => r.key === this.name).pop();
    return last ? Number(last.value.replace(/\D/g, "")) : 0;
  }

  /** Copy the next row; flush the position every `flushEvery` rows. */
  tick() {
    if (!this.running || this.position >= this.table.length) return;
    const i = this.position;
    const row = this.table[i];
    this.cluster.produce(this.topic, row.id, row.value);
    if (this.sent.has(i)) this.duplicates++;
    this.sent.add(i);
    this.position++;
    if (this.position - this.committed() >= this.flushEvery) this.flush();
  }

  flush() {
    if (this.position === this.committed()) return;
    this.cluster.produce(this.offsetsTopic, this.name, `row ${this.position}`);
  }

  crash() {
    this.running = false;
  }

  /** A new task starts from the flushed position, not from where the old one really was. */
  restart() {
    if (this.running) return;
    this.position = this.committed();
    this.running = true;
  }

  get pending() {
    return this.table.length - this.position;
  }
}

/**
 * A Kafka Streams app counting records per key: reads `input` (group = application.id), keeps the
 * counts in a local state store and writes every update to the store's changelog topic.
 */
export class CountingApp {
  readonly store = new Map<string, number>();
  running = true;
  /** Changelog records replayed so far while restoring (null when not restoring). */
  restoring: { done: number; total: number } | null = null;
  restores = 0;

  constructor(
    private cluster: Cluster,
    readonly appId: string,
    readonly input: string,
    readonly changelog: string,
  ) {}

  tick() {
    if (this.restoring) return this.restoreStep();
    if (!this.running) return;
    const t = this.cluster.topic(this.input);
    for (let p = 0; p < t.numPartitions; p++) {
      const r = this.cluster.fetch(this.appId, this.input, p);
      if (!r || r.key === null) continue;
      const n = (this.store.get(r.key) ?? 0) + 1;
      this.store.set(r.key, n);
      this.cluster.produce(this.changelog, r.key, String(n));
    }
  }

  /** The machine dies: its local state store is gone with it. */
  crash() {
    this.running = false;
    this.store.clear();
  }

  /** A new instance rebuilds the store by replaying the changelog before processing again. */
  restart() {
    if (this.running || this.restoring) return;
    this.restoring = { done: 0, total: streamView(this.cluster, this.changelog).length };
    if (!this.restoring.total) this.finishRestore();
  }

  private restoreStep() {
    const log = streamView(this.cluster, this.changelog);
    for (let i = 0; i < 2 && this.restoring && this.restoring.done < this.restoring.total; i++) {
      const r = log[this.restoring.done++];
      if (r.key !== null) this.store.set(r.key, Number(r.value));
    }
    if (this.restoring && this.restoring.done >= this.restoring.total) this.finishRestore();
  }

  private finishRestore() {
    this.restoring = null;
    this.running = true;
    this.restores++;
  }
}

export type Window = { start: number; end: number; count: number; closed: boolean };

/**
 * Tumbling-window count on event time. Stream time is the largest timestamp seen; a window closes
 * once stream time reaches its end + grace, and records for a closed window are dropped.
 */
export class WindowedCounter {
  streamTime = 0;
  grace = 0;
  dropped = 0;
  accepted = 0;
  /** Accepted records that arrived after a newer one (out of order but within grace). */
  lateAccepted = 0;
  private counts = new Map<number, number>();

  constructor(
    private cluster: Cluster,
    readonly topic: string,
    readonly size = 10,
    readonly step = 3,
  ) {}

  /** Send an event that happened `lateness` seconds before now (0 = right now, advancing time). */
  send(key: string, lateness: number) {
    const ts = lateness === 0 ? (this.streamTime += this.step) : Math.max(0, this.streamTime - lateness);
    this.cluster.produce(this.topic, key, `t=${ts}s`, { "x-ts": String(ts) });
    return this.process(ts);
  }

  /** Returns true if the record was counted, false if it was dropped as too late. */
  process(ts: number): boolean {
    this.streamTime = Math.max(this.streamTime, ts);
    const start = Math.floor(ts / this.size) * this.size;
    if (this.streamTime >= start + this.size + this.grace) {
      this.dropped++;
      return false;
    }
    if (ts < this.streamTime) this.lateAccepted++;
    this.accepted++;
    this.counts.set(start, (this.counts.get(start) ?? 0) + 1);
    return true;
  }

  windows(): Window[] {
    const last = Math.floor(this.streamTime / this.size) * this.size;
    const out: Window[] = [];
    for (let start = 0; start <= last; start += this.size)
      out.push({ start, end: start + this.size, count: this.counts.get(start) ?? 0, closed: this.streamTime >= start + this.size + this.grace });
    return out;
  }
}
