// The simulation's only side effect is emitting these events. Stage, audio and
// level logic subscribe to them, so every animation and sound maps to a Kafka event.

export type Headers = Record<string, string>;

/** A log segment: offsets [start, end); only the last one (active) receives writes. */
export type Segment = { index: number; start: number; end: number; active: boolean; remote: boolean };

export type SimRecord = {
  topic: string;
  key: string | null;
  value: string;
  headers: Headers;
  partition: number;
  offset: number;
  timestamp: number;
};

export type SimEvent =
  | { type: "produced"; topic: string; record: SimRecord; hashed: boolean }
  | { type: "appended"; topic: string; record: SimRecord }
  /** A consumer group read a record. Reading never removes it from the log. */
  | { type: "fetched"; topic: string; group: string; record: SimRecord; position: number; member?: string }
  | { type: "partitionsAdded"; topic: string; total: number }
  /** Producer batching: records waiting for a batch to fill or linger.ms to expire (0 = sent). */
  | { type: "buffered"; topic: string; partition: number; count: number; batchSize: number }
  /** The broker wrote the record but the acknowledgement never reached the producer. */
  | { type: "ackLost"; topic: string; record: SimRecord }
  /** Idempotent producer: the broker recognised a retried sequence number and dropped it. */
  | { type: "duplicateRejected"; topic: string; partition: number; key: string; seq: number }
  /** Replication: a broker went down / a replica became leader. */
  | { type: "brokerDown"; topic: string }
  | { type: "leaderElected"; topic: string; lost: number }
  | { type: "brokerUp"; topic: string }
  | { type: "isrChanged"; isr: string[] }
  | { type: "highWatermark"; topic: string; offset: number }
  | { type: "produceRejected"; reason: "offline" | "notEnoughReplicas" }
  | { type: "partitionOffline"; reason: "noQuorum" | "noIsr" }
  | { type: "controllerDown"; name: string }
  | { type: "controllerElected"; name: string | null }
  /** Storage (World 7). */
  | { type: "offsetOutOfRange"; group: string; topic: string; partition: number; from: number; to: number }
  | { type: "segments"; topic: string; partition: number; segments: Segment[] }
  | { type: "recordsRemoved"; topic: string; partition: number; offsets: number[]; reason: "retention" | "compaction" }
  /** Transactions (World 6). `fenced` = a newer instance with the same transactional.id took over. */
  | { type: "txn"; state: "begin" | "commit" | "abort" | "fenced"; id: number }
  /** Consumer groups (World 4). */
  | { type: "assignment"; group: string; topic: string; members: { id: string; partitions: number[]; color: string }[]; paused: number[] }
  | { type: "committed"; group: string; topic: string; partition: number; offset: number }
  | { type: "memberDown"; group: string; member: string }
  | { type: "processed"; group: string; member: string; partition: number; offset: number; duplicate: boolean };

type Listener = (event: SimEvent) => void;

export class SimEmitter {
  private listeners = new Set<Listener>();

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: SimEvent) {
    for (const l of this.listeners) l(event);
  }
}
