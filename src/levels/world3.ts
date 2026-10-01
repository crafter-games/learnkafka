// World 3 — Producers. Facts: docs/research/kafka-curriculum.md (Producers): batch.size / linger.ms
// (default 5 ms since 4.0), compression.type (default none), acks (default all since 3.0),
// enable.idempotence (default true since 3.0), delivery.timeout.ms bounds retries.
// Time is slowed down so batches, copies and retries are visible.
import { CODECS, type Codec } from "@/sim/producer";
import { choices, msg, randInt, type Level, type Question } from "./types";

const RECORD_KB = 1;
const PIPE_KB = 3;

// ---------------------------------------------------------------- 3-1 Trucks wait or go

const q31: Question[] = [
  {
    concept: "batching",
    build: (r) => {
      const b = randInt(r, 3, 8);
      const ms = [50, 100, 200][randInt(r, 0, 2)];
      const L = [100, 250, 500, 1000][randInt(r, 0, 3)];
      const count = Math.min(b, Math.floor(L / ms) + 1);
      return { prompt: msg("3-1.check.first.q", { b, ms, L }), input: { type: "number" }, answer: count, explain: msg("3-1.check.first.why", { b, ms, L, count }) };
    },
  },
  { concept: "batching", build: (r) => ({ prompt: msg("3-1.check.linger.q"), input: choices(r, "3-1.check.linger", ["wait", "retry", "keep"]), answer: "wait", explain: msg("3-1.check.linger.why") }) },
  { concept: "batching", build: (r) => ({ prompt: msg("3-1.check.default.q"), input: choices(r, "3-1.check.default", ["five", "zero", "hundred", "second"]), answer: "five", explain: msg("3-1.check.default.why") }) },
  { concept: "batching", build: (r) => ({ prompt: msg("3-1.check.bigger.q"), input: choices(r, "3-1.check.bigger", ["tradeoff", "both", "nothing"]), answer: "tradeoff", explain: msg("3-1.check.bigger.why") }) },
];

const level31: Level = {
  id: "3-1",
  world: 3,
  title: msg("3-1.title"),
  summary: msg("3-1.summary"),
  topics: [{ name: "orders", partitions: 2 }],
  slots: 9,
  producer: { batching: { batchSize: 1, lingerMs: 0, codec: "none" } },
  steps: [
    {
      kind: "brief",
      title: msg("3-1.brief.title"),
      body: msg("3-1.brief.body"),
      mapping: [
        { icon: "factory", thing: msg("3-1.map.truck"), kafka: msg("3-1.map.batch") },
        { icon: "package", thing: msg("3-1.map.capacity"), kafka: msg("3-1.map.size") },
        { icon: "clock", thing: msg("3-1.map.wait"), kafka: msg("3-1.map.linger") },
        { icon: "next", thing: msg("3-1.map.trip"), kafka: msg("3-1.map.request") },
      ],
      breaks: msg("3-1.brief.breaks"),
    },
    {
      kind: "task",
      title: msg("3-1.tune.title"),
      body: msg("3-1.tune.body"),
      tools: [
        { type: "setting", field: "batchSize", options: [1, 2, 4, 8] },
        { type: "setting", field: "lingerMs", options: [0, 100, 300, 1000] },
      ],
      onEnter: (ctx) => {
        ctx.bg.autoSend("orders", 6);
        ctx.bg.watch(() => !!ctx.batching && ctx.batching.requestsPerSecond() <= 2.2 && ctx.batching.avgWaitMs() <= 700);
      },
      meters: (ctx) => [
        { label: msg("3-1.tune.requests"), value: ctx.batching?.requestsPerSecond() ?? 0, max: 7, danger: 2.3, unit: "/s" },
        { label: msg("3-1.tune.wait"), value: ctx.batching?.avgWaitMs() ?? 0, max: 1500, danger: 701, unit: "ms" },
      ],
      progress: (ctx) => ({ done: Math.min(5, ctx.stats.calm), total: 5 }),
      success: msg("3-1.tune.success"),
    },
    {
      kind: "predict",
      build: () => ({ prompt: msg("3-1.when.q"), input: { type: "number" }, answer: 1, explain: msg("3-1.when.why") }),
    },
    {
      kind: "predict",
      build: (ctx) => ({ prompt: msg("3-1.raise.q"), input: choices(ctx.rng, "3-1.raise", ["tradeoff", "faster", "none"]), answer: "tradeoff", explain: msg("3-1.raise.why") }),
    },
  ],
  check: q31,
};

// ---------------------------------------------------------------- 3-2 Vacuum pack

const q32: Question[] = [
  { concept: "compression", build: (r) => ({ prompt: msg("3-2.check.default.q"), input: choices(r, "3-2.check.default", ["none", "gzip", "zstd", "lz4"]), answer: "none", explain: msg("3-2.check.default.why") }) },
  { concept: "compression", build: (r) => ({ prompt: msg("3-2.check.unit.q"), input: choices(r, "3-2.check.unit", ["batch", "field", "key"]), answer: "batch", explain: msg("3-2.check.unit.why") }) },
  { concept: "compression", build: (r) => ({ prompt: msg("3-2.check.broker.q"), input: choices(r, "3-2.check.broker", ["keeps", "decompresses", "recompresses"]), answer: "keeps", explain: msg("3-2.check.broker.why") }) },
  {
    concept: "compression",
    build: (r) => {
      const rate = [100, 200, 500][randInt(r, 0, 2)];
      const kb = randInt(r, 1, 4);
      const pct = [25, 50][randInt(r, 0, 1)];
      const ans = (rate * kb * pct) / 100;
      return { prompt: msg("3-2.check.wire.q", { rate, kb, pct }), input: { type: "number" }, answer: ans, explain: msg("3-2.check.wire.why", { rate, kb, pct, ans }) };
    },
  },
];

const wire = (codec: Codec | undefined, rate: number) => Math.round(rate * RECORD_KB * CODECS[codec ?? "none"].ratio * 10) / 10;

const level32: Level = {
  id: "3-2",
  world: 3,
  title: msg("3-2.title"),
  summary: msg("3-2.summary"),
  topics: [{ name: "orders", partitions: 2 }],
  slots: 9,
  producer: { batching: { batchSize: 4, lingerMs: 500, codec: "none" } },
  steps: [
    {
      kind: "brief",
      title: msg("3-2.brief.title"),
      body: msg("3-2.brief.body"),
      mapping: [
        { icon: "package", thing: msg("3-2.map.vacuum"), kafka: msg("3-2.map.compression") },
        { icon: "factory", thing: msg("3-2.map.truck"), kafka: msg("3-2.map.batch") },
        { icon: "rows", thing: msg("3-2.map.stored"), kafka: msg("3-2.map.broker") },
        { icon: "robot", thing: msg("3-2.map.unpack"), kafka: msg("3-2.map.consumer") },
      ],
      breaks: msg("3-2.brief.breaks"),
    },
    {
      kind: "task",
      title: msg("3-2.pipe.title"),
      body: msg("3-2.pipe.body", { cap: PIPE_KB }),
      tools: [{ type: "setting", field: "codec", options: ["none", "gzip", "snappy", "lz4", "zstd"] }],
      onEnter: (ctx) => {
        ctx.bg.autoSend("orders", 6);
        ctx.bg.watch(() => wire(ctx.batching?.config.codec, 6) <= PIPE_KB);
      },
      meters: (ctx) => [
        { label: msg("3-2.pipe.network"), value: wire(ctx.batching?.config.codec, 6), max: 7, danger: PIPE_KB + 0.01, unit: "KB/s" },
        { label: msg("3-2.pipe.cpu"), value: CODECS[ctx.batching?.config.codec ?? "none"].cpu, max: 4, danger: 3 },
      ],
      progress: (ctx) => ({ done: Math.min(4, ctx.stats.calm), total: 4 }),
      success: msg("3-2.pipe.success"),
    },
    {
      kind: "predict",
      build: (ctx) => ({ prompt: msg("3-2.where.q"), input: choices(ctx.rng, "3-2.where", ["consumer", "broker", "producer"]), answer: "consumer", explain: msg("3-2.where.why") }),
    },
    {
      kind: "predict",
      build: (ctx) => ({ prompt: msg("3-2.best.q"), input: choices(ctx.rng, "3-2.best", ["big", "small", "keys"]), answer: "big", explain: msg("3-2.best.why") }),
    },
  ],
  check: q32,
};

// ---------------------------------------------------------------- 3-3 Signed receipts (acks)

const BROKERS = ["broker-1", "broker-2", "broker-3"];

const q33: Question[] = [
  { concept: "acks", build: (r) => ({ prompt: msg("3-3.check.one.q"), input: choices(r, "3-3.check.one", ["leader", "all", "never"]), answer: "leader", explain: msg("3-3.check.one.why") }) },
  { concept: "acks", build: (r) => ({ prompt: msg("3-3.check.default.q"), input: choices(r, "3-3.check.default", ["all", "one", "zero"]), answer: "all", explain: msg("3-3.check.default.why") }) },
  { concept: "acks", build: (r) => ({ prompt: msg("3-3.check.lose.q"), input: choices(r, "3-3.check.lose", ["one", "all", "neither"]), answer: "one", explain: msg("3-3.check.lose.why") }) },
  { concept: "acks", build: (r) => ({ prompt: msg("3-3.check.zero.q"), input: choices(r, "3-3.check.zero", ["nowait", "leader", "all"]), answer: "nowait", explain: msg("3-3.check.zero.why") }) },
];

const level33: Level = {
  id: "3-3",
  world: 3,
  title: msg("3-3.title"),
  summary: msg("3-3.summary"),
  topics: BROKERS.map((name) => ({ name, partitions: 1 })),
  slots: 7,
  producer: { replicas: { names: BROKERS, acks: "1" } },
  steps: [
    {
      kind: "brief",
      title: msg("3-3.brief.title"),
      body: msg("3-3.brief.body"),
      mapping: [
        { icon: "rows", thing: msg("3-3.map.belts"), kafka: msg("3-3.map.replicas") },
        { icon: "flag", thing: msg("3-3.map.star"), kafka: msg("3-3.map.leader") },
        { icon: "note", thing: msg("3-3.map.receipt"), kafka: msg("3-3.map.ack") },
      ],
      breaks: msg("3-3.brief.breaks"),
    },
    {
      kind: "watch",
      title: msg("3-3.crash1.title"),
      body: msg("3-3.crash1.body"),
      receipts: true,
      script: async (ctx) => {
        const rs = ctx.replicas!;
        rs.acks = "1";
        for (const [i, k] of ["alice", "bob", "carol"].entries()) {
          rs.send(k, i + 1);
          await ctx.wait(250);
        }
        await ctx.wait(600);
        rs.crashLeader();
        await ctx.wait(1800);
      },
    },
    {
      kind: "predict",
      build: (ctx) => ({ prompt: msg("3-3.fix.q"), input: choices(ctx.rng, "3-3.fix", ["all", "zero", "partitions"]), answer: "all", explain: msg("3-3.fix.why") }),
    },
    {
      kind: "task",
      title: msg("3-3.crash2.title"),
      body: msg("3-3.crash2.body"),
      receipts: true,
      tools: [{ type: "setting", field: "acks", options: ["0", "1", "all"] }, { type: "send", via: "replicas", keys: ["dave", "erin", "frank"] }, { type: "crash" }],
      progress: (ctx, start) => {
        const rs = ctx.replicas!;
        const all = rs.acks === "all" ? 1 : 0;
        const acked = rs.receipts.filter((r) => r.n > start.produced && r.status === "acked").length >= 2 ? 1 : 0;
        const survived = rs.down.size >= 2 && rs.lostAcked === start.lostAcked ? 1 : 0;
        return { done: all + acked + survived, total: 3 };
      },
      success: msg("3-3.crash2.success"),
    },
    {
      kind: "predict",
      build: (ctx) => ({ prompt: msg("3-3.alone.q"), input: choices(ctx.rng, "3-3.alone", ["succeeds", "fails", "waits"]), answer: "succeeds", explain: msg("3-3.alone.why") }),
    },
  ],
  check: q33,
};

// ---------------------------------------------------------------- 3-4 Lost receipt (idempotence)

const q34: Question[] = [
  { concept: "idempotence", build: (r) => ({ prompt: msg("3-4.check.default.q"), input: choices(r, "3-4.check.default", ["true", "false"]), answer: "true", explain: msg("3-4.check.default.why") }) },
  { concept: "idempotence", build: (r) => ({ prompt: msg("3-4.check.detect.q"), input: choices(r, "3-4.check.detect", ["seq", "value", "time"]), answer: "seq", explain: msg("3-4.check.detect.why") }) },
  { concept: "idempotence", build: (r) => ({ prompt: msg("3-4.check.eos.q"), input: choices(r, "3-4.check.eos", ["session", "e2e", "consumers"]), answer: "session", explain: msg("3-4.check.eos.why") }) },
  { concept: "idempotence", build: (r) => ({ prompt: msg("3-4.check.bound.q"), input: choices(r, "3-4.check.bound", ["delivery", "retries", "linger"]), answer: "delivery", explain: msg("3-4.check.bound.why") }) },
];

const level34: Level = {
  id: "3-4",
  world: 3,
  title: msg("3-4.title"),
  summary: msg("3-4.summary"),
  topics: [{ name: "orders", partitions: 1 }],
  slots: 9,
  producer: { retrying: { idempotent: false, ackLoss: 0.5 } },
  steps: [
    {
      kind: "brief",
      title: msg("3-4.brief.title"),
      body: msg("3-4.brief.body"),
      mapping: [
        { icon: "note", thing: msg("3-4.map.receipt"), kafka: msg("3-4.map.ack") },
        { icon: "next", thing: msg("3-4.map.resend"), kafka: msg("3-4.map.retry") },
      ],
      breaks: msg("3-4.brief.breaks"),
    },
    {
      kind: "task",
      title: msg("3-4.flaky.title"),
      body: msg("3-4.flaky.body"),
      tools: [{ type: "send", via: "retrying", keys: ["alice", "bob"] }],
      progress: (ctx, start) => ({ done: Math.min(1, (ctx.retrying?.duplicates ?? 0) - start.dups), total: 1 }),
      success: msg("3-4.flaky.success"),
    },
    {
      kind: "brief",
      title: msg("3-4.seals.title"),
      body: msg("3-4.seals.body"),
      mapping: [{ icon: "hash", thing: msg("3-4.map.seal"), kafka: msg("3-4.map.seq") }],
      code: "enable.idempotence=true   # default since Kafka 3.0\nacks=all\nretries=2147483647\ndelivery.timeout.ms=120000\nmax.in.flight.requests.per.connection=5",
    },
    {
      kind: "task",
      title: msg("3-4.fix.title"),
      body: msg("3-4.fix.body"),
      tools: [{ type: "setting", field: "idempotent", options: [false, true] }, { type: "send", via: "retrying", keys: ["carol", "dave"] }],
      progress: (ctx, start) => {
        const r = ctx.retrying!;
        return { done: r.idempotent ? Math.min(2, r.rejected - start.rejected) : 0, total: 2 };
      },
      success: msg("3-4.fix.success"),
    },
    {
      kind: "predict",
      build: (ctx) => ({ prompt: msg("3-4.protects.q"), input: choices(ctx.rng, "3-4.protects", ["retries", "consumers", "producers"]), answer: "retries", explain: msg("3-4.protects.why") }),
    },
  ],
  check: q34,
};

export const WORLD3: Level[] = [level31, level32, level33, level34];
