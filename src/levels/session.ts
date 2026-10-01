import { Cluster } from "@/sim/cluster";
import type { Headers, SimRecord } from "@/sim/events";
import { seeded, type Level, type LevelCtx, type TaskStats } from "./types";

const ZERO: TaskStats = { produced: 0, nullKeys: 0, routedOk: 0, routedWrong: 0 };

export const newSeed = () => Math.floor(Math.random() * 0xffffff);

/** Mutable state of one level run: the cluster, task counters and landing promises. */
export class LevelSession {
  readonly cluster: Cluster;
  readonly stats: TaskStats = { ...ZERO };
  stepStart: TaskStats = { ...ZERO };
  readonly ctx: LevelCtx;
  private landed = new Map<string, () => void>();

  constructor(level: Level) {
    this.cluster = new Cluster(level.topics);
    this.ctx = {
      cluster: this.cluster,
      rng: seeded(newSeed()),
      stats: this.stats,
      wait: (ms) => new Promise((r) => setTimeout(r, ms)),
      produce: (topic, key, value = `order-${this.stats.produced + 1}`) => {
        const r = this.produce(topic, key, value);
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
    };
  }

  private id(r: SimRecord) {
    return `${r.topic}/${r.partition}/${r.offset}`;
  }

  produce(topic: string, key: string | null, value: string, headers: Headers = {}) {
    const r = this.cluster.produce(topic, key, value, headers);
    this.stats.produced++;
    if (key === null) this.stats.nullKeys++;
    return r;
  }

  /** Stage callback: resolves the promise of a scripted produce once its box lands. */
  landedRecord(r: SimRecord) {
    const id = this.id(r);
    this.landed.get(id)?.();
    this.landed.delete(id);
  }

  route(ok: boolean, topic: string, key: string, value: string) {
    if (ok) {
      this.stats.routedOk++;
      this.produce(topic, key, value);
    } else this.stats.routedWrong++;
  }

  markStepStart() {
    this.stepStart = { ...this.stats };
  }
}
