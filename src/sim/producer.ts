import type { Cluster } from "./cluster";
import type { SimRecord } from "./events";

// Producer-side mechanics (World 3). Facts: docs/research/kafka-curriculum.md (World 5 of the
// curriculum): batching by batch.size / linger.ms, whole-batch compression, idempotence.

export type Codec = "none" | "gzip" | "snappy" | "lz4" | "zstd";

/** Illustrative size ratios and CPU cost for a JSON-ish payload (relative, not benchmarks). */
export const CODECS: Record<Codec, { ratio: number; cpu: number }> = {
  none: { ratio: 1, cpu: 0 },
  snappy: { ratio: 0.5, cpu: 1 },
  lz4: { ratio: 0.45, cpu: 1 },
  zstd: { ratio: 0.3, cpu: 2 },
  gzip: { ratio: 0.32, cpu: 3 },
};

export type BatchConfig = {
  /** Records per batch (real Kafka uses batch.size in bytes; records keep it visible). */
  batchSize: number;
  lingerMs: number;
  codec: Codec;
};

type Pending = { topic: string; partition: number; records: { key: string | null; value: string; at: number }[]; timer: ReturnType<typeof setTimeout> | null };

/**
 * Accumulates records per partition and sends a batch (one request) when it is full
 * or when linger.ms expires, whichever comes first.
 */
export class BatchingProducer {
  private pending = new Map<string, Pending>();
  requests = 0;
  private sentAt: number[] = [];
  private waits: number[] = [];

  constructor(
    private cluster: Cluster,
    public config: BatchConfig,
    private now: () => number = () => Date.now(),
  ) {}

  send(topic: string, key: string | null, value: string) {
    const t = this.cluster.topic(topic);
    const partition = key === null ? t.peekNullPartition() : t.partitionFor(key);
    const id = `${topic}/${partition}`;
    let batch = this.pending.get(id);
    if (!batch) {
      batch = { topic, partition, records: [], timer: null };
      this.pending.set(id, batch);
    }
    batch.records.push({ key, value, at: this.now() });
    if (!batch.timer) batch.timer = setTimeout(() => this.flush(id), this.config.lingerMs);
    this.cluster.events.emit({ type: "buffered", topic, partition, count: batch.records.length, batchSize: this.config.batchSize });
    if (batch.records.length >= this.config.batchSize) this.flush(id);
  }

  flush(id: string) {
    const batch = this.pending.get(id);
    if (!batch || !batch.records.length) return;
    if (batch.timer) clearTimeout(batch.timer);
    this.pending.delete(id);
    this.requests++;
    const t = this.now();
    this.sentAt.push(t);
    const codec = this.config.codec;
    for (const r of batch.records) {
      this.waits.push(t - r.at);
      this.cluster.produce(batch.topic, r.key, r.value, codec === "none" ? {} : { "x-codec": codec }, batch.partition);
    }
    this.cluster.events.emit({ type: "buffered", topic: batch.topic, partition: batch.partition, count: 0, batchSize: this.config.batchSize });
  }

  /** Requests sent in the last `windowMs`, scaled to per-second. */
  requestsPerSecond(windowMs = 4000): number {
    const since = this.now() - windowMs;
    this.sentAt = this.sentAt.filter((s) => s >= since);
    return Math.round((this.sentAt.length * 1000) / windowMs * 10) / 10;
  }

  /** Average time records waited in a batch (last 20). */
  avgWaitMs(): number {
    const w = this.waits.slice(-20);
    return w.length ? Math.round(w.reduce((a, b) => a + b, 0) / w.length) : 0;
  }

  stop() {
    for (const b of this.pending.values()) if (b.timer) clearTimeout(b.timer);
    this.pending.clear();
  }
}

/**
 * A producer on a flaky network: the broker writes the record but the acknowledgement can be
 * lost, so the producer retries. Without idempotence the retry is written again (duplicate);
 * with it, the broker recognises the (producer id, sequence) and drops the copy.
 */
export class RetryingProducer {
  private seq = new Map<string, number>();
  private written = new Map<string, Set<number>>(); // broker-side: seqs already appended per partition
  duplicates = 0;
  rejected = 0;

  constructor(
    private cluster: Cluster,
    public idempotent: boolean,
    public ackLoss: number,
    private rng: () => number,
    private retryMs = 700,
  ) {}

  send(topic: string, key: string, value: string): SimRecord {
    const partition = this.cluster.topic(topic).partitionFor(key);
    const id = `${topic}/${partition}`;
    const seq = (this.seq.get(id) ?? 0) + 1;
    this.seq.set(id, seq);
    const first = this.append(topic, key, value, partition, seq, false);
    if (this.rng() < this.ackLoss) {
      this.cluster.events.emit({ type: "ackLost", topic, record: first });
      setTimeout(() => this.retry(topic, key, value, partition, seq), this.retryMs);
    }
    return first;
  }

  private retry(topic: string, key: string, value: string, partition: number, seq: number) {
    const id = `${topic}/${partition}`;
    if (this.idempotent && this.written.get(id)?.has(seq)) {
      this.rejected++;
      this.cluster.events.emit({ type: "duplicateRejected", topic, partition, key, seq });
      return;
    }
    this.duplicates++;
    this.append(topic, key, value, partition, seq, true);
  }

  private append(topic: string, key: string, value: string, partition: number, seq: number, duplicate: boolean) {
    const id = `${topic}/${partition}`;
    if (!this.written.has(id)) this.written.set(id, new Set());
    this.written.get(id)!.add(seq);
    return this.cluster.produce(topic, key, value, duplicate ? { "x-seq": String(seq), "x-dup": "1" } : { "x-seq": String(seq) }, partition);
  }
}
