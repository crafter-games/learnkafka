import { SimEmitter, type Headers, type SimRecord } from "./events";
import { Topic } from "./topic";

export type TopicSpec = { name: string; partitions: number };

/**
 * A tiny single-broker "cluster": named topics sharing one event stream, plus
 * consumer-group positions. A group's position is the offset of the NEXT record
 * it will read in each partition; fetching never removes data from the log.
 */
export class Cluster {
  readonly events = new SimEmitter();
  readonly topics = new Map<string, Topic>();
  private positions = new Map<string, number[]>(); // `${group}/${topic}` → per-partition position

  constructor(specs: TopicSpec[]) {
    for (const s of specs) this.topics.set(s.name, new Topic(s.name, s.partitions, this.events));
  }

  topic(name: string): Topic {
    const t = this.topics.get(name);
    if (!t) throw new Error(`unknown topic ${name}`);
    return t;
  }

  get topicList(): Topic[] {
    return [...this.topics.values()];
  }

  produce(topic: string, key: string | null, value: string, headers: Headers = {}): SimRecord {
    return this.topic(topic).produce(key, value, headers);
  }

  private pos(group: string, topic: string): number[] {
    const id = `${group}/${topic}`;
    let p = this.positions.get(id);
    if (!p) {
      p = Array(this.topic(topic).numPartitions).fill(0);
      this.positions.set(id, p);
    }
    return p;
  }

  position(group: string, topic: string, partition: number): number {
    return this.pos(group, topic)[partition];
  }

  /** Read the next record for a group in one partition, or null when caught up. */
  fetch(group: string, topic: string, partition: number): SimRecord | null {
    const positions = this.pos(group, topic);
    const record = this.topic(topic).partitions[partition][positions[partition]];
    if (!record) return null;
    positions[partition]++;
    this.events.emit({ type: "fetched", topic, group, record, position: positions[partition] });
    return record;
  }

  /** Records the group still has to read in a partition (log-end offset − position). */
  lag(group: string, topic: string, partition: number): number {
    return this.topic(topic).partitions[partition].length - this.position(group, topic, partition);
  }

  totalRecords(): number {
    return this.topicList.reduce((n, t) => n + t.endOffsets().reduce((a, b) => a + b, 0), 0);
  }
}
