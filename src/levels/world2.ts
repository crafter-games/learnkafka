// World 2 — Partitions & Keys. Facts: docs/research/kafka-curriculum.md (World 2).
// 2-1 and 2-2 are challenge-first (productive failure): try, struggle, then the concept.
import { partitionForKey } from "@/sim/murmur2";
import { STICKY_BATCH_RECORDS } from "@/sim/topic";
import { COLORS } from "@/stage/theme";
import { choices, msg, randInt, type Level, type Question } from "./types";

const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
const FULFIL = { group: "fulfil", label: "Fulfilment", color: hex(COLORS.consumer) };
const FIVE = ["alice", "bob", "carol", "dave", "erin"];

/** How many records with this key the workers have delivered, in strictly increasing #n order. */
function deliveredInOrder(delivered: { key: string | null; value: string }[], key: string) {
  const seq = delivered.filter((r) => r.key === key).map((r) => Number(r.value.replace("#", "")));
  return { count: seq.length, ordered: seq.every((n, i) => i === 0 || n > seq[i - 1]) };
}

// ---------------------------------------------------------------- 2-1 Traffic jam

const q21: Question[] = [
  {
    concept: "parallelism",
    build: (r) => {
      const n = randInt(r, 3, 12);
      return { prompt: msg("2-1.check.maxConsumers.q", { n }), input: { type: "number" }, answer: n, explain: msg("2-1.check.maxConsumers.why", { n }) };
    },
  },
  {
    concept: "parallelism",
    build: (r) => {
      const c = [50, 100, 150, 200][randInt(r, 0, 3)];
      const k = randInt(r, 2, 6);
      return { prompt: msg("2-1.check.capacity.q", { p: c * k, c }), input: { type: "number" }, answer: k, explain: msg("2-1.check.capacity.why", { p: c * k, c, k }) };
    },
  },
  { concept: "parallelism", build: (r) => ({ prompt: msg("2-1.check.unit.q"), input: choices(r, "2-1.check.unit", ["partition", "topic", "record", "producer"]), answer: "partition", explain: msg("2-1.check.unit.why") }) },
  { concept: "parallelism", build: (r) => ({ prompt: msg("2-1.check.shrink.q"), input: choices(r, "2-1.check.shrink", ["cannot", "alter", "delete"]), answer: "cannot", explain: msg("2-1.check.shrink.why") }) },
];

const level21: Level = {
  id: "2-1",
  world: 2,
  title: msg("2-1.title"),
  summary: msg("2-1.summary"),
  topics: [{ name: "orders", partitions: 1, max: 4 }],
  slots: 8,
  consumers: [FULFIL],
  steps: [
    { kind: "brief", title: msg("2-1.brief.title"), body: msg("2-1.brief.body"), breaks: msg("2-1.brief.breaks") },
    {
      kind: "task",
      title: msg("2-1.rush.title"),
      body: msg("2-1.rush.body"),
      tools: [{ type: "addPartition", topic: "orders", max: 4 }],
      onEnter: (ctx) => {
        ctx.bg.autoProduce("orders", 2);
        ctx.bg.workers("fulfil", "orders", 1000);
        ctx.bg.watchCalm("fulfil", "orders", 3);
      },
      meters: (ctx) => [{ label: msg("2-1.rush.meter"), value: ctx.cluster.totalLag("fulfil", "orders"), max: 15, danger: 8 }],
      progress: (ctx, start) => ({ done: ctx.stats.partitionsAdded > start.partitionsAdded ? Math.min(5, ctx.stats.calm) : 0, total: 5 }),
      success: msg("2-1.rush.success"),
    },
    {
      kind: "brief",
      title: msg("2-1.unit.title"),
      body: msg("2-1.unit.body"),
      mapping: [
        { icon: "rows", thing: msg("2-1.map.belts"), kafka: msg("2-1.map.partitions") },
        { icon: "robot", thing: msg("2-1.map.worker"), kafka: msg("2-1.map.consumer") },
        { icon: "counter", thing: msg("2-1.map.backlog"), kafka: msg("2-1.map.lag") },
      ],
      code: "kafka-topics.sh --bootstrap-server localhost:9092 \\\n  --alter --topic orders --partitions 3",
    },
    {
      kind: "predict",
      build: (ctx) => {
        const rate = randInt(ctx.rng, 3, 6);
        return { prompt: msg("2-1.min.q", { rate }), input: { type: "number" }, answer: rate, explain: msg("2-1.min.why", { rate }) };
      },
    },
    {
      kind: "predict",
      build: (ctx) => ({ prompt: msg("2-1.reduce.q"), input: choices(ctx.rng, "2-1.reduce", ["no", "yes", "empty"]), answer: "no", explain: msg("2-1.reduce.why") }),
    },
  ],
  check: q21,
};

// ---------------------------------------------------------------- 2-2 Same customer, same belt

const q22: Question[] = [
  { concept: "key-ordering", build: (r) => ({ prompt: msg("2-2.check.how.q"), input: choices(r, "2-2.check.how", ["key", "nokey", "topic"]), answer: "key", explain: msg("2-2.check.how.why") }) },
  { concept: "key-ordering", build: (r) => ({ prompt: msg("2-2.check.rr.q"), input: choices(r, "2-2.check.rr", ["none", "global", "time"]), answer: "none", explain: msg("2-2.check.rr.why") }) },
  {
    concept: "key-ordering",
    build: (r) => {
      const a = randInt(r, 1, 6), b = a + randInt(r, 2, 5), c = b + randInt(r, 2, 5);
      return { prompt: msg("2-2.check.first.q", { a: c, bb: a, c: b }), input: { type: "number" }, answer: a, explain: msg("2-2.check.first.why", { a, bb: b, c }) };
    },
  },
  { concept: "key-ordering", build: (r) => ({ prompt: msg("2-2.check.hot.q"), input: choices(r, "2-2.check.hot", ["hotspot", "auto", "nothing"]), answer: "hotspot", explain: msg("2-2.check.hot.why") }) },
];

const level22: Level = {
  id: "2-2",
  world: 2,
  title: msg("2-2.title"),
  summary: msg("2-2.summary"),
  topics: [{ name: "orders", partitions: 3 }],
  slots: 8,
  consumers: [FULFIL],
  steps: [
    { kind: "brief", title: msg("2-2.brief.title"), body: msg("2-2.brief.body") },
    {
      kind: "watch",
      title: msg("2-2.busy.title"),
      body: msg("2-2.busy.body"),
      script: async (ctx) => {
        for (const k of ["peggy", "victor", "trent", "sybil", "walter"]) {
          await ctx.produce("orders", k, "bulk", 0);
          await ctx.wait(60);
        }
      },
    },
    {
      kind: "task",
      title: msg("2-2.rr.title"),
      body: msg("2-2.rr.body"),
      tools: [{ type: "produce", topic: "orders", keys: ["alice"], sequence: true, roundRobin: true }],
      onEnter: (ctx) => ctx.bg.workers("fulfil", "orders", 900),
      deliveries: true,
      progress: (ctx) => ({ done: Math.min(3, deliveredInOrder(ctx.delivered, "alice").count), total: 3 }),
      success: msg("2-2.rr.success"),
    },
    {
      kind: "brief",
      title: msg("2-2.keys.title"),
      body: msg("2-2.keys.body"),
      mapping: [
        { icon: "tag", thing: msg("2-2.map.sticker"), kafka: msg("2-2.map.key") },
        { icon: "rows", thing: msg("2-2.map.sameBelt"), kafka: msg("2-2.map.samePartition") },
        { icon: "robot", thing: msg("2-2.map.oneWorker"), kafka: msg("2-2.map.inOrder") },
      ],
      breaks: msg("2-2.keys.breaks"),
    },
    {
      kind: "task",
      title: msg("2-2.keyed.title"),
      body: msg("2-2.keyed.body"),
      tools: [{ type: "produce", topic: "orders", keys: ["carol"], sequence: true }],
      onEnter: (ctx) => ctx.bg.workers("fulfil", "orders", 900),
      deliveries: true,
      progress: (ctx) => {
        const d = deliveredInOrder(ctx.delivered, "carol");
        return { done: d.ordered ? Math.min(3, d.count) : 0, total: 3 };
      },
      success: msg("2-2.keyed.success"),
    },
    {
      kind: "predict",
      build: (ctx) => {
        const p = ctx.cluster.topic("orders").partitionFor("carol");
        return { prompt: msg("2-2.where.q"), input: { type: "partition", topic: "orders" }, answer: p, explain: msg("2-2.where.why", { p }), reveal: (c) => c.produce("orders", "carol", "#4") };
      },
    },
  ],
  check: q22,
};

// ---------------------------------------------------------------- 2-3 No label?

const q23: Question[] = [
  { concept: "sticky", build: (r) => ({ prompt: msg("2-3.check.default.q"), input: choices(r, "2-3.check.default", ["sticky", "dropped", "zero"]), answer: "sticky", explain: msg("2-3.check.default.why") }) },
  {
    concept: "sticky",
    build: (r) => {
      const b = STICKY_BATCH_RECORDS, n = 3, k = randInt(r, 5, 14);
      // P0 gets the first batch, then every n-th batch after it
      let onP0 = 0;
      for (let i = 0; i < k; i++) if (Math.floor(i / b) % n === 0) onP0++;
      return { prompt: msg("2-3.check.count.q", { bb: b, n, k }), input: { type: "number" }, answer: onP0, explain: msg("2-3.check.count.why", { bb: b, n, k, x: onP0 }) };
    },
  },
  { concept: "sticky", build: (r) => ({ prompt: msg("2-3.check.why.q"), input: choices(r, "2-3.check.why", ["batching", "ordering", "durability"]), answer: "batching", explain: msg("2-3.check.why.why") }) },
  { concept: "key-ordering", build: (r) => ({ prompt: msg("2-3.check.order.q"), input: choices(r, "2-3.check.order", ["partition", "always", "never"]), answer: "partition", explain: msg("2-3.check.order.why") }) },
];

const level23: Level = {
  id: "2-3",
  world: 2,
  title: msg("2-3.title"),
  summary: msg("2-3.summary"),
  topics: [{ name: "orders", partitions: 3 }],
  slots: 8,
  steps: [
    {
      kind: "brief",
      title: msg("2-3.brief.title"),
      body: msg("2-3.brief.body"),
      mapping: [
        { icon: "package", thing: msg("2-3.map.noSticker"), kafka: msg("2-3.map.nullKey") },
        { icon: "factory", thing: msg("2-3.map.truck"), kafka: msg("2-3.map.batch") },
        { icon: "next", thing: msg("2-3.map.switch"), kafka: msg("2-3.map.nextPartition") },
      ],
      breaks: msg("2-3.brief.breaks", { bb: STICKY_BATCH_RECORDS }),
    },
    {
      kind: "watch",
      title: msg("2-3.fill.title"),
      body: msg("2-3.fill.body"),
      script: async (ctx) => {
        for (let i = 0; i < 6; i++) {
          void ctx.produce("orders", null);
          await ctx.wait(260);
        }
        await ctx.wait(1400);
      },
    },
    {
      kind: "predict",
      build: (ctx) => {
        const p = ctx.cluster.topic("orders").peekNullPartition();
        return { prompt: msg("2-3.next.q"), input: { type: "partition", topic: "orders" }, answer: p, explain: msg("2-3.next.why", { p, bb: STICKY_BATCH_RECORDS }), reveal: (c) => c.produce("orders", null) };
      },
    },
    {
      kind: "predict",
      build: (ctx) => ({ prompt: msg("2-3.why.q"), input: choices(ctx.rng, "2-3.why", ["batching", "ordering", "random"]), answer: "batching", explain: msg("2-3.why.why") }),
    },
    {
      kind: "task",
      title: msg("2-3.all.title"),
      body: msg("2-3.all.body"),
      tools: [{ type: "produce", topic: "orders", keys: [], allowNull: true }],
      progress: (ctx) => ({ done: ctx.cluster.topic("orders").endOffsets().filter((n) => n >= 4).length, total: 3 }),
      success: msg("2-3.all.success"),
    },
  ],
  check: q23,
};

// ---------------------------------------------------------------- 2-4 New belt, new chaos

const q24: Question[] = [
  {
    concept: "repartition",
    build: (r) => {
      const n = randInt(r, 3, 6);
      const h = randInt(r, 10, 99);
      return { prompt: msg("2-4.check.mod.q", { h, n }), input: { type: "number" }, answer: h % n, explain: msg("2-4.check.mod.why", { h, n, r: h % n }) };
    },
  },
  { concept: "repartition", build: (r) => ({ prompt: msg("2-4.check.risk.q"), input: choices(r, "2-4.check.risk", ["ordering", "loss", "stop"]), answer: "ordering", explain: msg("2-4.check.risk.why") }) },
  { concept: "repartition", build: (r) => ({ prompt: msg("2-4.check.cmd.q"), input: choices(r, "2-4.check.cmd", ["alter", "create", "reassign"]), answer: "alter", explain: msg("2-4.check.cmd.why") }) },
  { concept: "repartition", build: (r) => ({ prompt: msg("2-4.check.old.q"), input: choices(r, "2-4.check.old", ["stay", "moved", "rehashed"]), answer: "stay", explain: msg("2-4.check.old.why") }) },
];

const level24: Level = {
  id: "2-4",
  world: 2,
  title: msg("2-4.title"),
  summary: msg("2-4.summary"),
  topics: [{ name: "orders", partitions: 3, max: 4 }],
  slots: 7,
  steps: [
    { kind: "brief", title: msg("2-4.brief.title"), body: msg("2-4.brief.body") },
    {
      kind: "watch",
      title: msg("2-4.before.title"),
      body: msg("2-4.before.body"),
      script: async (ctx) => {
        for (const k of FIVE) {
          await ctx.produce("orders", k);
          await ctx.wait(100);
        }
      },
    },
    {
      kind: "predict",
      build: (ctx) => ({ prompt: msg("2-4.same.q"), input: choices(ctx.rng, "2-4.same", ["some", "all", "none"]), answer: "some", explain: msg("2-4.same.why") }),
    },
    {
      kind: "task",
      title: msg("2-4.grow.title"),
      body: msg("2-4.grow.body"),
      tools: [
        { type: "addPartition", topic: "orders", max: 4 },
        { type: "produce", topic: "orders", keys: FIVE },
      ],
      keyMoves: { topic: "orders", keys: FIVE },
      progress: (ctx) => {
        const t = ctx.cluster.topic("orders");
        if (t.numPartitions < 4) return { done: 0, total: FIVE.length };
        const ok = FIVE.filter((k) => t.partitions[partitionForKey(k, 4)].some((r) => r.key === k)).length;
        return { done: ok, total: FIVE.length };
      },
      success: msg("2-4.grow.success"),
    },
    {
      kind: "brief",
      title: msg("2-4.hurts.title"),
      body: msg("2-4.hurts.body"),
      breaks: msg("2-4.hurts.breaks"),
      code: "kafka-topics.sh --bootstrap-server localhost:9092 \\\n  --alter --topic orders --partitions 4",
    },
    {
      kind: "predict",
      build: (ctx) => {
        const h = randInt(ctx.rng, 10, 60);
        return { prompt: msg("2-4.mod.q", { h }), input: { type: "number" }, answer: h % 4, explain: msg("2-4.mod.why", { h, r: h % 4, r3: h % 3 }) };
      },
    },
  ],
  check: q24,
};

export const WORLD2: Level[] = [level21, level22, level23, level24];
