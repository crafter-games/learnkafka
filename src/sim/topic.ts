import { SimEmitter, type Headers, type SimRecord } from "./events";
import { partitionForKey } from "./murmur2";

/** Records a null-key producer sends to one partition before switching (sticky partitioning, KIP-794). */
export const STICKY_BATCH_RECORDS = 4;

export class Topic {
  /** Full history indexed by offset; deleted/compacted records are tracked, never re-indexed (offsets are forever). */
  readonly partitions: SimRecord[][];
  /** First offset still on disk per partition (retention moves it forward). */
  readonly logStart: number[];
  /** Offsets removed by compaction (gaps), per partition. */
  readonly removed: Set<number>[];
  private stickyPartition = 0;
  private stickyCount = 0;

  constructor(
    readonly name: string,
    numPartitions: number,
    readonly events = new SimEmitter(),
    private now: () => number = () => Date.now(),
  ) {
    this.partitions = Array.from({ length: numPartitions }, () => []);
    this.logStart = Array(numPartitions).fill(0);
    this.removed = Array.from({ length: numPartitions }, () => new Set());
  }

  /** Is this offset no longer on disk (deleted by retention or removed by compaction)? */
  isGone(partition: number, offset: number) {
    return offset < this.logStart[partition] || this.removed[partition].has(offset);
  }

  get numPartitions() {
    return this.partitions.length;
  }

  private choosePartition(key: string | null): number {
    if (key !== null) return partitionForKey(key, this.numPartitions);
    if (this.stickyCount >= STICKY_BATCH_RECORDS) {
      this.stickyPartition = (this.stickyPartition + 1) % this.numPartitions;
      this.stickyCount = 0;
    }
    this.stickyCount++;
    return this.stickyPartition;
  }

  /** Where the next keyless record would go (sticky partitioner state), for predictions. */
  peekNullPartition(): number {
    return this.stickyCount >= STICKY_BATCH_RECORDS ? (this.stickyPartition + 1) % this.numPartitions : this.stickyPartition;
  }

  /** Kafka can only ever ADD partitions; keyed records hash with the new count from now on. */
  addPartitions(count: number) {
    for (let i = 0; i < count; i++) {
      this.partitions.push([]);
      this.logStart.push(0);
      this.removed.push(new Set());
    }
    this.events.emit({ type: "partitionsAdded", topic: this.name, total: this.numPartitions });
  }

  /** Which partition a key would go to, without producing (for predictions). */
  partitionFor(key: string): number {
    return partitionForKey(key, this.numPartitions);
  }

  /** `partition` overrides the partitioner (an explicit partition, e.g. round-robin demos). */
  produce(key: string | null, value: string, headers: Headers = {}, partition = this.choosePartition(key)): SimRecord {
    const log = this.partitions[partition];
    const record: SimRecord = { topic: this.name, key, value, headers, partition, offset: log.length, timestamp: this.now() };
    this.events.emit({ type: "produced", topic: this.name, record, hashed: key !== null });
    log.push(record);
    this.events.emit({ type: "appended", topic: this.name, record });
    return record;
  }

  /** Log-end offset per partition (the offset the next record will get). */
  endOffsets(): number[] {
    return this.partitions.map((p) => p.length);
  }
}
