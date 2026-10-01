import { Cluster } from "@/sim/cluster";
import type { Headers, SimRecord } from "@/sim/events";
import { seeded, type Level, type LevelCtx, type SimRecordLike, type TaskStats } from "./types";

const ZERO: TaskStats = { produced: 0, nullKeys: 0, routedOk: 0, routedWrong: 0, calm: 0, partitionsAdded: 0 };
const AUTO_KEYS = ["alice", "bob", "carol", "dave", "erin", "frank", "grace", "heidi", "ivan", "judy", "mallory", "niaj", "olivia", "peggy", "rupert", "sybil", "trent", "victor", "walter"];

export const newSeed = () => Math.floor(Math.random() * 0xffffff);

/** Mutable state of one level run: the cluster, task counters, background timers. */
export class LevelSession {
  readonly cluster: Cluster;
  readonly stats: TaskStats = { ...ZERO };
  stepStart: TaskStats = { ...ZERO };
  readonly delivered: SimRecordLike[] = [];
  readonly ctx: LevelCtx;
  private landed = new Map<string, () => void>();
  private timers: ReturnType<typeof setInterval>[] = [];
  private rrNext = new Map<string, number>();

  constructor(level: Level) {
    this.cluster = new Cluster(level.topics);
    const rng = seeded(newSeed());
    this.ctx = {
      cluster: this.cluster,
      rng,
      stats: this.stats,
      delivered: this.delivered,
      wait: (ms) => new Promise((r) => setTimeout(r, ms)),
      produce: (topic, key, value = `order-${this.stats.produced + 1}`, partition) => {
        const r = this.produce(topic, key, value, {}, false, partition);
        return new Promise<void>((resolve) => {
          const id = this.id(r);
          this.landed.set(id, resolve);
          setTimeout(() => this.landed.delete(id) && resolve(), 3000);
        });
      },
      fetch: (group, topic, partition) => {
        this.cluster.fetch(group, topic, partition);
        return new Promise((r) => setTimeout(r, 450));
      },
      bg: {
        workers: (group, topic, ms) =>
          this.every(ms, () => {
            const t = this.cluster.topic(topic);
            for (let p = 0; p < t.numPartitions; p++) {
              const r = this.cluster.fetch(group, topic, p);
              if (r) this.delivered.push({ key: r.key, value: r.value, partition: r.partition, offset: r.offset });
            }
          }),
        autoProduce: (topic, perSecond, keys = AUTO_KEYS) =>
          this.every(1000 / perSecond, () => this.produce(topic, keys[Math.floor(rng() * keys.length)], `order-${this.stats.produced + 1}`)),
        watchCalm: (group, topic, max) =>
          this.every(1000, () => {
            this.stats.calm = this.cluster.totalLag(group, topic) <= max ? this.stats.calm + 1 : 0;
          }),
      },
    };
  }

  private every(ms: number, fn: () => void) {
    this.timers.push(setInterval(fn, ms));
  }

  private id(r: SimRecord) {
    return `${r.topic}/${r.partition}/${r.offset}`;
  }

  produce(topic: string, key: string | null, value: string, headers: Headers = {}, roundRobin = false, explicit?: number) {
    let partition = explicit;
    if (roundRobin) {
      const n = this.cluster.topic(topic).numPartitions;
      partition = (this.rrNext.get(topic) ?? 0) % n;
      this.rrNext.set(topic, partition + 1);
    }
    const r = this.cluster.produce(topic, key, value, headers, partition);
    this.stats.produced++;
    if (key === null) this.stats.nullKeys++;
    return r;
  }

  addPartition(topic: string) {
    this.cluster.addPartitions(topic, 1);
    this.stats.partitionsAdded++;
  }

  route(ok: boolean, topic: string, key: string, value: string) {
    if (ok) {
      this.stats.routedOk++;
      this.produce(topic, key, value);
    } else this.stats.routedWrong++;
  }

  /** Stage callback: resolves the promise of a scripted produce once its box lands. */
  landedRecord(r: SimRecord) {
    const id = this.id(r);
    this.landed.get(id)?.();
    this.landed.delete(id);
  }

  /** New step: stop background work and snapshot counters. */
  markStepStart() {
    this.stopBackground();
    this.stats.calm = 0;
    this.stepStart = { ...this.stats };
  }

  stopBackground() {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
  }
}
