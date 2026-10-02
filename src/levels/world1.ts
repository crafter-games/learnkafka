// World 1 — Events & the Log. Facts: docs/research/kafka-curriculum.md (World 1).
// Each level: brief (mapping card) → predict/watch/task steps → recall check (stage hidden).
import { partitionForKey } from "@/sim/murmur2";
import { COLORS } from "@/stage/theme";
import { choices, msg, randInt, type Level, type Question } from "./types";

const CUSTOMERS = ["alice", "bob", "carol", "dave", "erin", "frank", "grace", "heidi", "ivan", "judy", "mallory", "niaj", "olivia", "peggy", "rupert", "sybil", "trent", "victor", "walter"];
const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

/** A customer whose key hashes to `partition` (so predictions can target a belt). */
function keyFor(partition: number, partitions: number, avoid: string[] = []) {
  return CUSTOMERS.find((k) => !avoid.includes(k) && partitionForKey(k, partitions) === partition) ?? CUSTOMERS[0];
}

const GROUPS = {
  billing: { group: "billing", label: "Billing", color: hex(COLORS.consumer) },
  shipping: { group: "shipping", label: "Shipping", color: "#8b5cf6" },
};

// ---------------------------------------------------------------- 1-1 First parcel

const q11: Question[] = [
  { concept: "record", build: (r) => ({ prompt: msg("1-1.check.notPart.q"), input: choices(r, "1-1.check.notPart", ["consumer", "key", "value", "headers", "timestamp"]), answer: "consumer", explain: msg("1-1.check.notPart.why") }) },
  { concept: "record", build: (r) => ({ prompt: msg("1-1.check.bytes.q"), input: choices(r, "1-1.check.bytes", ["bytes", "json", "object", "row"]), answer: "bytes", explain: msg("1-1.check.bytes.why") }) },
  { concept: "record", build: (r) => ({ prompt: msg("1-1.check.timestamp.q"), input: choices(r, "1-1.check.timestamp", ["producer", "broker", "consumer"]), answer: "producer", explain: msg("1-1.check.timestamp.why") }) },
  { concept: "record", build: (r) => ({ prompt: msg("1-1.check.nullKey.q"), input: choices(r, "1-1.check.nullKey", ["yes", "no", "headers"]), answer: "yes", explain: msg("1-1.check.nullKey.why") }) },
];

const level11: Level = {
  id: "1-1",
  world: 1,
  title: msg("1-1.title"),
  summary: msg("1-1.summary"),
  topics: [{ name: "orders", partitions: 3 }],
  slots: 7,
  steps: [
    {
      kind: "brief",
      title: msg("1-1.brief.title"),
      body: msg("1-1.brief.body"),
      mapping: [
        { icon: "package", thing: msg("1-1.map.box"), kafka: msg("1-1.map.record") },
        { icon: "tag", thing: msg("1-1.map.sticker"), kafka: msg("1-1.map.key") },
        { icon: "file", thing: msg("1-1.map.contents"), kafka: msg("1-1.map.value") },
        { icon: "note", thing: msg("1-1.map.labels"), kafka: msg("1-1.map.headers") },
        { icon: "clock", thing: msg("1-1.map.postmark"), kafka: msg("1-1.map.timestamp") },
      ],
      breaks: msg("1-1.brief.breaks"),
    },
    {
      kind: "task",
      title: msg("1-1.pack.title"),
      streams: "record",
      body: msg("1-1.pack.body"),
      tools: [{ type: "produce", topic: "orders", keys: ["alice", "bob", "carol"], headers: true }],
      progress: (ctx, start) => ({ done: ctx.stats.produced - start.produced, total: 1 }),
      success: msg("1-1.pack.success"),
    },
    {
      kind: "predict",
      build: (ctx) => ({
        prompt: msg("1-1.which.q"),
        input: choices(ctx.rng, "1-1.which", ["key", "value", "headers", "timestamp"]),
        answer: "key",
        explain: msg("1-1.which.why"),
        reveal: (c) => c.produce("orders", "dave"),
      }),
    },
    {
      kind: "predict",
      build: (ctx) => {
        const p = ctx.cluster.topic("orders").partitionFor("dave");
        return {
          prompt: msg("1-1.again.q", { p }),
          input: { type: "partition", topic: "orders" },
          answer: p,
          explain: msg("1-1.again.why", { p }),
          reveal: (c) => c.produce("orders", "dave"),
        };
      },
    },
    {
      kind: "task",
      title: msg("1-1.more.title"),
      streams: "record",
      body: msg("1-1.more.body"),
      tools: [{ type: "produce", topic: "orders", keys: ["alice", "bob", "carol", "dave"], allowNull: true, allowCustom: true }],
      progress: (ctx, start) => {
        // 3 records, at least one of them without a key
        const sent = ctx.stats.produced - start.produced;
        const hasNull = ctx.stats.nullKeys > start.nullKeys;
        return { done: Math.min(hasNull ? 3 : 2, sent), total: 3 };
      },
      success: msg("1-1.more.success"),
    },
  ],
  check: q11,
};

// ---------------------------------------------------------------- 1-2 The belt never forgets

const q12: Question[] = [
  {
    concept: "reading",
    build: (r) => {
      const n = randInt(r, 4, 12);
      return { prompt: msg("1-2.check.remain.q", { n }), input: { type: "number" }, answer: n, explain: msg("1-2.check.remain.why", { n }) };
    },
  },
  {
    concept: "position",
    build: (r) => {
      const last = randInt(r, 5, 14);
      const p = randInt(r, 1, last);
      return { prompt: msg("1-2.check.left.q", { last, p }), input: { type: "number" }, answer: last + 1 - p, explain: msg("1-2.check.left.why", { last, p, n: last + 1, left: last + 1 - p }) };
    },
  },
  { concept: "reading", build: (r) => ({ prompt: msg("1-2.check.groups.q"), input: choices(r, "1-2.check.groups", ["independent", "shared", "reset"]), answer: "independent", explain: msg("1-2.check.groups.why") }) },
  { concept: "immutability", build: (r) => ({ prompt: msg("1-2.check.update.q"), input: choices(r, "1-2.check.update", ["append", "edit", "replace"]), answer: "append", explain: msg("1-2.check.update.why") }) },
];

const level12: Level = {
  id: "1-2",
  world: 1,
  title: msg("1-2.title"),
  summary: msg("1-2.summary"),
  topics: [{ name: "orders", partitions: 1 }],
  slots: 7,
  consumers: [GROUPS.billing, GROUPS.shipping],
  steps: [
    {
      kind: "brief",
      title: msg("1-2.brief.title"),
      body: msg("1-2.brief.body"),
      mapping: [
        { icon: "robot", thing: msg("1-2.map.arm"), kafka: msg("1-2.map.group") },
        { icon: "scan", thing: msg("1-2.map.scan"), kafka: msg("1-2.map.fetch") },
        { icon: "flag", thing: msg("1-2.map.flag"), kafka: msg("1-2.map.position") },
      ],
      breaks: msg("1-2.brief.breaks"),
    },
    {
      kind: "watch",
      title: msg("1-2.arrive.title"),
      streams: "positions",
      body: msg("1-2.arrive.body"),
      script: async (ctx) => {
        for (const k of ["alice", "bob", "carol", "alice"]) {
          await ctx.produce("orders", k);
          await ctx.wait(150);
        }
      },
    },
    {
      kind: "predict",
      build: (ctx) => ({
        prompt: msg("1-2.read.q"),
        input: choices(ctx.rng, "1-2.read", ["stays", "removed", "moves"]),
        answer: "stays",
        explain: msg("1-2.read.why"),
        reveal: (c) => c.fetch("billing", "orders", 0),
      }),
    },
    {
      kind: "task",
      title: msg("1-2.catch.title"),
      streams: "positions",
      body: msg("1-2.catch.body"),
      tools: [{ type: "fetch", topic: "orders", partition: 0, groups: ["billing", "shipping"] }],
      progress: (ctx) => ({ done: Math.min(3, ctx.cluster.position("shipping", "orders", 0)), total: 3 }),
      success: msg("1-2.catch.success"),
    },
    {
      kind: "predict",
      build: (ctx) => {
        const n = ctx.cluster.topic("orders").partitions[0].length;
        return {
          prompt: msg("1-2.count.q", { billing: ctx.cluster.position("billing", "orders", 0), shipping: ctx.cluster.position("shipping", "orders", 0) }),
          input: { type: "number" },
          answer: n,
          explain: msg("1-2.count.why", { n }),
        };
      },
    },
    {
      kind: "brief",
      title: msg("1-2.change.title"),
      body: msg("1-2.change.body"),
      breaks: msg("1-2.change.note"),
    },
    {
      kind: "predict",
      build: (ctx) => ({
        prompt: msg("1-2.update.q"),
        input: choices(ctx.rng, "1-2.update", ["append", "edit", "delete"]),
        answer: "append",
        explain: msg("1-2.update.why"),
        reveal: (c) => c.produce("orders", "alice", "order v2"),
      }),
    },
  ],
  check: q12,
};

// ---------------------------------------------------------------- 1-3 Stamps (offsets)

const q13: Question[] = [
  {
    concept: "offset",
    build: (r) => {
      const n = randInt(r, 2, 15);
      const k = randInt(r, 2, 6);
      return { prompt: msg("1-3.check.last.q", { n, k }), input: { type: "number" }, answer: n + k - 1, explain: msg("1-3.check.last.why", { n, k, last: n + k - 1 }) };
    },
  },
  { concept: "offset", build: (r) => ({ prompt: msg("1-3.check.unique.q"), input: choices(r, "1-3.check.unique", ["partition", "topic", "cluster"]), answer: "partition", explain: msg("1-3.check.unique.why") }) },
  {
    concept: "offset",
    build: (r) => {
      const m = randInt(r, 3, 40);
      return { prompt: msg("1-3.check.count.q", { m }), input: { type: "number" }, answer: m + 1, explain: msg("1-3.check.count.why", { m, n: m + 1 }) };
    },
  },
  { concept: "position", build: (r) => ({ prompt: msg("1-3.check.position.q"), input: choices(r, "1-3.check.position", ["next", "last", "deleted"]), answer: "next", explain: msg("1-3.check.position.why") }) },
];

const level13: Level = {
  id: "1-3",
  world: 1,
  title: msg("1-3.title"),
  summary: msg("1-3.summary"),
  topics: [{ name: "orders", partitions: 3 }],
  slots: 8,
  steps: [
    {
      kind: "brief",
      title: msg("1-3.brief.title"),
      body: msg("1-3.brief.body"),
      mapping: [
        { icon: "hash", thing: msg("1-3.map.stamp"), kafka: msg("1-3.map.offset") },
        { icon: "counter", thing: msg("1-3.map.counter"), kafka: msg("1-3.map.perPartition") },
        { icon: "next", thing: msg("1-3.map.next"), kafka: msg("1-3.map.leo") },
      ],
      breaks: msg("1-3.brief.breaks"),
    },
    {
      kind: "watch",
      title: msg("1-3.warm.title"),
      streams: "partitions",
      body: msg("1-3.warm.body"),
      script: async (ctx) => {
        for (const k of ["alice", "bob", "carol", "dave", "alice"]) {
          await ctx.produce("orders", k);
          await ctx.wait(120);
        }
      },
    },
    {
      kind: "predict",
      build: (ctx) => {
        const t = ctx.cluster.topic("orders");
        const ends = t.endOffsets();
        const p = ends.indexOf(Math.max(...ends));
        const key = keyFor(p, 3);
        return {
          prompt: msg("1-3.nextOffset.q", { key, p, c: ends[p] }),
          input: { type: "number" },
          answer: ends[p],
          explain: msg("1-3.nextOffset.why", { c: ends[p] }),
          reveal: (c) => c.produce("orders", key),
        };
      },
    },
    {
      kind: "predict",
      build: (ctx) => {
        const p = ctx.cluster.topic("orders").partitionFor("bob");
        return {
          prompt: msg("1-3.where.q"),
          input: { type: "partition", topic: "orders" },
          answer: p,
          explain: msg("1-3.where.why", { p }),
          reveal: (c) => c.produce("orders", "bob"),
        };
      },
    },
    {
      kind: "predict",
      build: (ctx) => {
        const ends = ctx.cluster.topic("orders").endOffsets();
        const q = ends.indexOf(Math.min(...ends));
        const key = keyFor(q, 3);
        return {
          prompt: msg("1-3.own.q", { q, key }),
          input: { type: "number" },
          answer: ends[q],
          explain: msg("1-3.own.why", { q, n: ends[q] }),
          reveal: (c) => c.produce("orders", key),
        };
      },
    },
    {
      kind: "task",
      title: msg("1-3.fill.title"),
      streams: "partitions",
      body: msg("1-3.fill.body"),
      tools: [{ type: "produce", topic: "orders", keys: ["alice", "bob", "carol", "dave", "erin"], allowCustom: true }],
      progress: (ctx) => ({ done: Math.min(5, ctx.cluster.topic("orders").partitions[1].length), total: 5 }),
      success: msg("1-3.fill.success"),
    },
  ],
  check: q13,
};

// ---------------------------------------------------------------- 1-4 Sorting docks (topics)

const q14: Question[] = [
  { concept: "topic", build: (r) => ({ prompt: msg("1-4.check.what.q"), input: choices(r, "1-4.check.what", ["log", "queue", "table"]), answer: "log", explain: msg("1-4.check.what.why") }) },
  {
    concept: "topic",
    build: (r) => {
      const n = randInt(r, 2, 12);
      const name = ["refunds", "clicks", "shipments", "invoices"][randInt(r, 0, 3)];
      return {
        prompt: msg("1-4.check.cli.q"),
        code: `kafka-topics.sh --bootstrap-server localhost:9092 \\\n  --create --topic ${name} --partitions ${n} \\\n  --replication-factor 1`,
        input: { type: "number" },
        answer: n,
        explain: msg("1-4.check.cli.why", { n }),
      };
    },
  },
  { concept: "topic", build: (r) => ({ prompt: msg("1-4.check.after.q"), input: choices(r, "1-4.check.after", ["stays", "deleted", "dlq"]), answer: "stays", explain: msg("1-4.check.after.why") }) },
  { concept: "ordering", build: (r) => ({ prompt: msg("1-4.check.order.q"), input: choices(r, "1-4.check.order", ["partition", "topic", "cluster"]), answer: "partition", explain: msg("1-4.check.order.why") }) },
];

const level14: Level = {
  id: "1-4",
  world: 1,
  title: msg("1-4.title"),
  summary: msg("1-4.summary"),
  topics: [
    { name: "orders", partitions: 2 },
    { name: "payments", partitions: 2 },
  ],
  slots: 6,
  steps: [
    {
      kind: "brief",
      title: msg("1-4.brief.title"),
      body: msg("1-4.brief.body"),
      mapping: [
        { icon: "factory", thing: msg("1-4.map.line"), kafka: msg("1-4.map.topic") },
        { icon: "sign", thing: msg("1-4.map.sign"), kafka: msg("1-4.map.name") },
        { icon: "rows", thing: msg("1-4.map.belts"), kafka: msg("1-4.map.partitions") },
      ],
      breaks: msg("1-4.brief.breaks"),
    },
    {
      kind: "task",
      title: msg("1-4.route.title"),
      streams: "routing",
      body: msg("1-4.route.body"),
      tools: [{ type: "route", topics: ["orders", "payments"], count: 6 }],
      progress: (ctx, start) => ({ done: Math.min(6, ctx.stats.routedOk - start.routedOk), total: 6 }),
      success: msg("1-4.route.success"),
    },
    {
      kind: "predict",
      build: (ctx) => ({
        prompt: msg("1-4.cross.q"),
        input: choices(ctx.rng, "1-4.cross", ["no", "yes", "timestamp"]),
        answer: "no",
        explain: msg("1-4.cross.why"),
      }),
    },
    {
      kind: "brief",
      title: msg("1-4.cli.title"),
      body: msg("1-4.cli.body"),
      code: "kafka-topics.sh --bootstrap-server localhost:9092 \\\n  --create --topic payments \\\n  --partitions 2 --replication-factor 1",
    },
    {
      kind: "predict",
      build: (ctx) => {
        const n = randInt(ctx.rng, 3, 8);
        return {
          prompt: msg("1-4.count.q"),
          code: `kafka-topics.sh --bootstrap-server localhost:9092 \\\n  --create --topic refunds --partitions ${n} \\\n  --replication-factor 1`,
          input: { type: "number" },
          answer: n,
          explain: msg("1-4.count.why", { n }),
        };
      },
    },
  ],
  check: q14,
};

export const WORLD1: Level[] = [level11, level12, level13, level14];
