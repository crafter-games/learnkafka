// World 5 — Brokers & Replication. Facts: docs/research/kafka-curriculum.md (World 3–4 of the
// curriculum): default.replication.factor=1, leader/followers, ISR (replica.lag.time.max.ms=30000),
// high watermark, min.insync.replicas=1 + acks=all → NotEnoughReplicas, unclean election off,
// KRaft controller quorum (ZooKeeper removed in 4.0). Time is slowed down.
import { choices, msg, randInt, type Level, type LevelCtx, type Question } from "./types";

const BROKERS = ["broker-1", "broker-2", "broker-3"];
const CONTROLLERS = ["controller-1", "controller-2", "controller-3"];
const KEYS = ["alice", "bob", "carol", "dave", "erin"];
const rs = (ctx: LevelCtx) => ctx.replicas!;

/** Background orders through the replicated partition, numbered #1, #2… */
const stream = (ms: number) => (ctx: LevelCtx) => {
  let n = 100;
  ctx.bg.every(ms, () => rs(ctx).send(KEYS[n % KEYS.length], ++n));
};

// ---------------------------------------------------------------- 5-1 Copies everywhere

const q51: Question[] = [
  { concept: "replication", build: (r) => ({ prompt: msg("5-1.check.default.q"), input: choices(r, "5-1.check.default", ["one", "three", "two"]), answer: "one", explain: msg("5-1.check.default.why") }) },
  { concept: "replication", build: (r) => ({ prompt: msg("5-1.check.writes.q"), input: choices(r, "5-1.check.writes", ["leader", "any", "all"]), answer: "leader", explain: msg("5-1.check.writes.why") }) },
  {
    concept: "replication",
    build: (r) => {
      const rf = randInt(r, 2, 5);
      return { prompt: msg("5-1.check.survive.q", { rf }), input: { type: "number" }, answer: rf - 1, explain: msg("5-1.check.survive.why", { rf, n: rf - 1 }) };
    },
  },
  { concept: "replication", build: (r) => ({ prompt: msg("5-1.check.followers.q"), input: choices(r, "5-1.check.followers", ["fetch", "producer", "zk"]), answer: "fetch", explain: msg("5-1.check.followers.why") }) },
];

const level51: Level = {
  id: "5-1",
  world: 5,
  title: msg("5-1.title"),
  summary: msg("5-1.summary"),
  topics: BROKERS.map((name) => ({ name, partitions: 1 })),
  slots: 7,
  producer: { replicas: { names: BROKERS, acks: "all", copyMs: 800 } },
  steps: [
    {
      kind: "brief",
      title: msg("5-1.brief.title"),
      body: msg("5-1.brief.body"),
      mapping: [
        { icon: "factory", thing: msg("5-1.map.warehouse"), kafka: msg("5-1.map.broker") },
        { icon: "rows", thing: msg("5-1.map.copies"), kafka: msg("5-1.map.replicas") },
        { icon: "flag", thing: msg("5-1.map.star"), kafka: msg("5-1.map.leader") },
      ],
      breaks: msg("5-1.brief.breaks"),
    },
    {
      kind: "watch",
      title: msg("5-1.copy.title"),
      body: msg("5-1.copy.body"),
      isr: true,
      script: async (ctx) => {
        for (const [i, k] of ["alice", "bob", "carol"].entries()) {
          rs(ctx).send(k, i + 1);
          await ctx.wait(500);
        }
        await ctx.wait(2600);
      },
    },
    {
      kind: "predict",
      build: (ctx) => ({ prompt: msg("5-1.where.q"), input: choices(ctx.rng, "5-1.where", ["leader", "any", "all"]), answer: "leader", explain: msg("5-1.where.why") }),
    },
    {
      kind: "task",
      title: msg("5-1.lose.title"),
      body: msg("5-1.lose.body"),
      receipts: true,
      isr: true,
      tools: [{ type: "send", via: "replicas", keys: ["dave", "erin"] }, { type: "brokers", actions: ["crash"] }],
      progress: (ctx, start) => {
        const r = rs(ctx);
        const acked = r.receipts.filter((x) => x.n > start.produced && x.status === "acked").length >= 2 ? 1 : 0;
        const crashed = r.down.has("broker-1") && r.leader !== null ? 1 : 0;
        const safe = crashed && r.lostAcked === start.lostAcked ? 1 : 0;
        return { done: acked + crashed + safe, total: 3 };
      },
      success: msg("5-1.lose.success"),
    },
    {
      kind: "predict",
      build: () => ({ prompt: msg("5-1.rf.q"), input: { type: "number" }, answer: 2, explain: msg("5-1.rf.why") }),
    },
  ],
  check: q51,
};

// ---------------------------------------------------------------- 5-2 Keeping up (ISR & HW)

const q52: Question[] = [
  { concept: "isr", build: (r) => ({ prompt: msg("5-2.check.isr.q"), input: choices(r, "5-2.check.isr", ["caught", "all", "leaders"]), answer: "caught", explain: msg("5-2.check.isr.why") }) },
  { concept: "isr", build: (r) => ({ prompt: msg("5-2.check.hw.q"), input: choices(r, "5-2.check.hw", ["committed", "end", "oldest"]), answer: "committed", explain: msg("5-2.check.hw.why") }) },
  { concept: "isr", build: (r) => ({ prompt: msg("5-2.check.lag.q"), input: choices(r, "5-2.check.lag", ["thirty", "one", "five"]), answer: "thirty", explain: msg("5-2.check.lag.why") }) },
  {
    concept: "isr",
    build: (r) => {
      const leader = randInt(r, 10, 30), a = leader, b = leader - randInt(r, 1, 6);
      return { prompt: msg("5-2.check.calc.q", { leader, a, bb: b }), input: { type: "number" }, answer: b, explain: msg("5-2.check.calc.why", { bb: b }) };
    },
  },
];

const level52: Level = {
  id: "5-2",
  world: 5,
  title: msg("5-2.title"),
  summary: msg("5-2.summary"),
  topics: BROKERS.map((name) => ({ name, partitions: 1 })),
  slots: 8,
  producer: { replicas: { names: BROKERS, acks: "all", copyMs: 600, isrLagMs: 2500 } },
  steps: [
    {
      kind: "brief",
      title: msg("5-2.brief.title"),
      body: msg("5-2.brief.body"),
      mapping: [
        { icon: "rows", thing: msg("5-2.map.pace"), kafka: msg("5-2.map.isr") },
        { icon: "flag", thing: msg("5-2.map.hw"), kafka: msg("5-2.map.hwK") },
      ],
      breaks: msg("5-2.brief.breaks"),
    },
    {
      kind: "task",
      title: msg("5-2.slow.title"),
      body: msg("5-2.slow.body"),
      isr: true,
      tools: [{ type: "brokers", actions: ["slow"] }],
      onEnter: stream(900),
      progress: (ctx, start) => {
        const dropped = ctx.stats.isrDrops > start.isrDrops ? 1 : 0;
        const back = dropped && ctx.stats.isrJoins > start.isrJoins ? 1 : 0;
        return { done: dropped + back, total: 2 };
      },
      success: msg("5-2.slow.success"),
    },
    {
      kind: "predict",
      build: (ctx) => ({ prompt: msg("5-2.wait.q"), input: choices(ctx.rng, "5-2.wait", ["no", "yes", "rejected"]), answer: "no", explain: msg("5-2.wait.why") }),
    },
    {
      kind: "predict",
      build: (ctx) => ({ prompt: msg("5-2.read.q"), input: choices(ctx.rng, "5-2.read", ["hw", "leader", "slowest"]), answer: "hw", explain: msg("5-2.read.why") }),
    },
  ],
  check: q52,
};

// ---------------------------------------------------------------- 5-3 Safety net (min.insync.replicas)

const q53: Question[] = [
  { concept: "min-insync", build: (r) => ({ prompt: msg("5-3.check.default.q"), input: choices(r, "5-3.check.default", ["one", "two", "three"]), answer: "one", explain: msg("5-3.check.default.why") }) },
  { concept: "min-insync", build: (r) => ({ prompt: msg("5-3.check.when.q"), input: choices(r, "5-3.check.when", ["below", "slow", "always"]), answer: "below", explain: msg("5-3.check.when.why") }) },
  { concept: "min-insync", build: (r) => ({ prompt: msg("5-3.check.prod.q"), input: choices(r, "5-3.check.prod", ["rf3min2", "rf1min1", "rf3min3"]), answer: "rf3min2", explain: msg("5-3.check.prod.why") }) },
  { concept: "min-insync", build: (r) => ({ prompt: msg("5-3.check.acks1.q"), input: choices(r, "5-3.check.acks1", ["ignored", "rejected", "waits"]), answer: "ignored", explain: msg("5-3.check.acks1.why") }) },
];

const level53: Level = {
  id: "5-3",
  world: 5,
  title: msg("5-3.title"),
  summary: msg("5-3.summary"),
  topics: BROKERS.map((name) => ({ name, partitions: 1 })),
  slots: 7,
  producer: { replicas: { names: BROKERS, acks: "all", minInsync: 1, copyMs: 600 } },
  steps: [
    { kind: "brief", title: msg("5-3.brief.title"), body: msg("5-3.brief.body"), breaks: msg("5-3.brief.breaks") },
    {
      kind: "watch",
      title: msg("5-3.alone.title"),
      body: msg("5-3.alone.body"),
      receipts: true,
      isr: true,
      script: async (ctx) => {
        await ctx.wait(600);
        rs(ctx).crash("broker-2");
        await ctx.wait(500);
        rs(ctx).crash("broker-3");
        await ctx.wait(800);
        rs(ctx).send("alice", 1);
        await ctx.wait(500);
        rs(ctx).send("bob", 2);
        await ctx.wait(1500);
      },
    },
    {
      kind: "task",
      title: msg("5-3.net.title"),
      body: msg("5-3.net.body"),
      receipts: true,
      isr: true,
      tools: [{ type: "setting", field: "minInsync", options: [1, 2, 3] }, { type: "send", via: "replicas", keys: ["carol", "dave"] }, { type: "brokers", actions: ["crash", "revive"] }],
      progress: (ctx, start) => {
        const r = rs(ctx);
        const two = r.minInsync === 2 ? 1 : 0;
        const mine = r.receipts.filter((x) => x.n > start.produced);
        const rejected = mine.some((x) => x.status === "rejected") ? 1 : 0;
        const ackedAfter = rejected && mine.some((x, i) => x.status === "acked" && mine.slice(0, i).some((y) => y.status === "rejected")) ? 1 : 0;
        return { done: two + rejected + ackedAfter, total: 3 };
      },
      success: msg("5-3.net.success"),
    },
    {
      kind: "predict",
      build: (ctx) => ({ prompt: msg("5-3.one.q"), input: choices(ctx.rng, "5-3.one", ["ok", "rejected", "lost"]), answer: "ok", explain: msg("5-3.one.why") }),
    },
    {
      kind: "predict",
      build: (ctx) => ({ prompt: msg("5-3.two.q"), input: choices(ctx.rng, "5-3.two", ["rejected", "ok", "lost"]), answer: "rejected", explain: msg("5-3.two.why") }),
    },
  ],
  check: q53,
};

// ---------------------------------------------------------------- 5-4 Who's in charge? (KRaft)

const q54: Question[] = [
  { concept: "kraft", build: (r) => ({ prompt: msg("5-4.check.zk.q"), input: choices(r, "5-4.check.zk", ["removed", "required", "optional"]), answer: "removed", explain: msg("5-4.check.zk.why") }) },
  { concept: "kraft", build: (r) => ({ prompt: msg("5-4.check.job.q"), input: choices(r, "5-4.check.job", ["metadata", "data", "consumers"]), answer: "metadata", explain: msg("5-4.check.job.why") }) },
  {
    concept: "kraft",
    build: (r) => {
      const n = [3, 5, 7][randInt(r, 0, 2)];
      return { prompt: msg("5-4.check.quorum.q", { n }), input: { type: "number" }, answer: Math.floor((n - 1) / 2), explain: msg("5-4.check.quorum.why", { n, f: Math.floor((n - 1) / 2), m: Math.floor(n / 2) + 1 }) };
    },
  },
  { concept: "kraft", build: (r) => ({ prompt: msg("5-4.check.unclean.q"), input: choices(r, "5-4.check.unclean", ["loss", "faster", "nothing"]), answer: "loss", explain: msg("5-4.check.unclean.why") }) },
];

const level54: Level = {
  id: "5-4",
  world: 5,
  title: msg("5-4.title"),
  summary: msg("5-4.summary"),
  topics: BROKERS.map((name) => ({ name, partitions: 1 })),
  slots: 7,
  producer: { replicas: { names: BROKERS, acks: "all", copyMs: 700, controllers: CONTROLLERS } },
  steps: [
    {
      kind: "brief",
      title: msg("5-4.brief.title"),
      body: msg("5-4.brief.body"),
      mapping: [
        { icon: "sign", thing: msg("5-4.map.tower"), kafka: msg("5-4.map.quorum") },
        { icon: "flag", thing: msg("5-4.map.star"), kafka: msg("5-4.map.active") },
        { icon: "note", thing: msg("5-4.map.logbook"), kafka: msg("5-4.map.metadata") },
      ],
      breaks: msg("5-4.brief.breaks"),
    },
    {
      kind: "task",
      title: msg("5-4.lose.title"),
      body: msg("5-4.lose.body"),
      isr: true,
      tools: [{ type: "controller" }, { type: "brokers", actions: ["crash"] }],
      onEnter: stream(1100),
      progress: (ctx) => {
        const r = rs(ctx);
        const ctrl = r.controllersDown.size === 1 ? 1 : 0;
        const failover = ctrl && r.down.size >= 1 && r.leader !== null ? 1 : 0;
        return { done: ctrl + failover, total: 2 };
      },
      success: msg("5-4.lose.success"),
    },
    {
      kind: "predict",
      build: (ctx) => ({ prompt: msg("5-4.noquorum.q"), input: choices(ctx.rng, "5-4.noquorum", ["offline", "elected", "zk"]), answer: "offline", explain: msg("5-4.noquorum.why") }),
    },
    { kind: "brief", title: msg("5-4.unclean.title"), body: msg("5-4.unclean.body"), code: "unclean.leader.election.enable=false   # default: wait for an in-sync replica\n# true: elect any replica — available sooner, but data can be lost" },
    {
      kind: "predict",
      build: (ctx) => ({ prompt: msg("5-4.choose.q"), input: choices(ctx.rng, "5-4.choose", ["false", "true"]), answer: "false", explain: msg("5-4.choose.why") }),
    },
  ],
  check: q54,
};

export const WORLD5: Level[] = [level51, level52, level53, level54];
