import type { Cluster, TopicSpec } from "@/sim/cluster";
import type { BatchConfig, BatchingProducer, RetryingProducer } from "@/sim/producer";
import type { Acks, ReplicaSet } from "@/sim/replication";
import type { ConsumerSpec } from "@/stage/factoryStage";

/** A translatable message: a key under the `levels` namespace plus ICU values. */
export type Msg = { key: string; values?: Record<string, string | number> };
export const msg = (key: string, values?: Msg["values"]): Msg => ({ key, values });

export type Concept =
  | "record" | "reading" | "immutability" | "offset" | "position" | "topic" | "ordering"
  | "parallelism" | "key-ordering" | "sticky" | "repartition"
  | "batching" | "compression" | "acks" | "idempotence";

export type Choice = { id: string; label: Msg };

/** What the player answers with. `partition` renders one button per partition of `topic`. */
export type ChoiceInput = { type: "choice"; options: Choice[] };
export type Input = ChoiceInput | { type: "number" } | { type: "partition"; topic: string };

/** Live context a step can read and act on. */
export type LevelCtx = {
  cluster: Cluster;
  rng: () => number;
  /** Produce and resolve once the box has landed on its conveyor. */
  produce: (topic: string, key: string | null, value?: string, partition?: number) => Promise<void>;
  fetch: (group: string, topic: string, partition: number) => Promise<void>;
  wait: (ms: number) => Promise<void>;
  stats: TaskStats;
  /** Background helpers; all of them stop automatically when the step changes. */
  bg: {
    /** One worker per partition reads a record every `msPerRecord` (records "delivered" in order of completion). */
    workers: (group: string, topic: string, msPerRecord: number) => void;
    /** Produce `perSecond` records with random customer keys. */
    autoProduce: (topic: string, perSecond: number, keys?: string[]) => void;
    /** Count consecutive seconds where the group's total lag stays at or below `max`. */
    watchCalm: (group: string, topic: string, max: number) => void;
    /** Count consecutive seconds where `ok()` holds (into stats.calm). */
    watch: (ok: () => boolean) => void;
    /** Send `perSecond` records through the batching producer. */
    autoSend: (topic: string, perSecond: number) => void;
  };
  batching?: BatchingProducer;
  retrying?: RetryingProducer;
  replicas?: ReplicaSet;
  /** Records in the order workers finished them. */
  delivered: SimRecordLike[];
};

export type SimRecordLike = { key: string | null; value: string; partition: number; offset: number };

export type TaskStats = {
  produced: number;
  nullKeys: number;
  routedOk: number;
  routedWrong: number;
  /** Consecutive calm seconds (see ctx.bg.watchCalm). */
  calm: number;
  partitionsAdded: number;
  /** World 3 counters, synced at every step start (live values come from ctx.retrying / ctx.replicas). */
  lostAcked: number;
  dups: number;
  rejected: number;
};

export type Prediction = {
  prompt: Msg;
  input: Input;
  answer: string | number;
  explain: Msg;
  code?: string;
  /** Plays the outcome on the stage after the player commits (predict → watch). */
  reveal?: (ctx: LevelCtx) => Promise<void>;
};

export type Tool =
  | {
      type: "produce";
      topic: string;
      keys: string[];
      allowNull?: boolean;
      allowCustom?: boolean;
      headers?: boolean;
      /** Number each key's records (#1, #2…) to make ordering visible. */
      sequence?: boolean;
      /** Ignore keys and spread records round-robin across partitions. */
      roundRobin?: boolean;
    }
  | { type: "addPartition"; topic: string; max: number }
  /** Send through the level's special producer (retrying or replicated). */
  | { type: "send"; via: "retrying" | "replicas"; topic?: string; keys: string[] }
  /** A segmented control bound to a producer/replica setting. */
  | { type: "setting"; field: "lingerMs" | "batchSize" | "codec" | "idempotent" | "acks"; options: (string | number | boolean)[] }
  | { type: "crash" }
  | { type: "fetch"; topic: string; partition: number; groups: string[] }
  | { type: "route"; topics: string[]; count: number };

export type Step =
  | { kind: "brief"; title: Msg; body: Msg; mapping?: { icon: string; thing: Msg; kafka: Msg }[]; breaks?: Msg; code?: string }
  | { kind: "watch"; title: Msg; body: Msg; script: (ctx: LevelCtx) => Promise<void>; deliveries?: boolean; receipts?: boolean }
  | { kind: "predict"; build: (ctx: LevelCtx) => Prediction }
  | {
      kind: "task";
      title: Msg;
      body: Msg;
      tools: Tool[];
      /** Progress toward the goal, re-evaluated after every sim event. Done when done >= total. */
      progress: (ctx: LevelCtx, start: TaskStats) => { done: number; total: number };
      success: Msg;
      onEnter?: (ctx: LevelCtx) => void;
      /** A live gauge shown on the step card (e.g. backlog). */
      meters?: (ctx: LevelCtx) => { label: Msg; value: number; max: number; danger: number; unit?: string }[];
      /** Show the producer's receipts (acked / waiting / lost). */
      receipts?: boolean;
      /** Show the delivery log (completion order) on the step card. */
      deliveries?: boolean;
      /** Show where each key went before vs. now (after adding partitions). */
      keyMoves?: { topic: string; keys: string[] };
    };

/** A recall-check question; `build` gets a seeded rng so a retry gets new numbers. */
export type Question = {
  concept: Concept;
  build: (rng: () => number) => { prompt: Msg; input: Exclude<Input, { type: "partition" }>; answer: string | number; explain: Msg; code?: string };
};

export type Level = {
  id: string;
  world: number;
  /** World 3 machinery, created fresh for every run. */
  producer?: { batching?: BatchConfig; retrying?: { idempotent: boolean; ackLoss: number }; replicas?: { names: string[]; acks: Acks } };
  title: Msg;
  summary: Msg;
  topics: TopicSpec[];
  slots?: number;
  consumers?: ConsumerSpec[];
  steps: Step[];
  check: Question[];
};

/** Deterministic PRNG (mulberry32) so a check can be regenerated with a new seed. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randInt = (rng: () => number, min: number, max: number) => min + Math.floor(rng() * (max - min + 1));

export function shuffle<T>(rng: () => number, items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Multiple choice where option ids are message suffixes: `${base}.${id}`. */
export function choices(rng: () => number, base: string, ids: string[]): ChoiceInput {
  return { type: "choice", options: shuffle(rng, ids).map((id) => ({ id, label: msg(`${base}.${id}`) })) };
}
