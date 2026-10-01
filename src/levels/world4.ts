// World 4 — Consumers & Groups. Facts: docs/research/kafka-curriculum.md (Consumers & Groups):
// poll loop (max.poll.records=500, max.poll.interval.ms=300000), one partition per member,
// rebalances (eager / cooperative / KIP-848 group.protocol=consumer; client default classic),
// commits in __consumer_offsets, auto.offset.reset=latest, lag = log end − committed.
import { choices, msg, randInt, type Level, type Question } from "./types";

const group = (ctx: { group?: import("@/sim/group").GroupSim }) => ctx.group!;

// ---------------------------------------------------------------- 4-1 Pull, don't push

const q41: Question[] = [
  { concept: "poll", build: (r) => ({ prompt: msg("4-1.check.who.q"), input: choices(r, "4-1.check.who", ["pull", "push", "zk"]), answer: "pull", explain: msg("4-1.check.who.why") }) },
  { concept: "poll", build: (r) => ({ prompt: msg("4-1.check.default.q"), input: choices(r, "4-1.check.default", ["500", "1", "50", "all"]), answer: "500", explain: msg("4-1.check.default.why") }) },
  {
    concept: "poll",
    build: (r) => {
      const pos = randInt(r, 2, 10), max = randInt(r, 2, 5);
      return { prompt: msg("4-1.check.last.q", { pos, max, end: pos + max + 5 }), input: { type: "number" }, answer: pos + max - 1, explain: msg("4-1.check.last.why", { pos, max, last: pos + max - 1 }) };
    },
  },
  { concept: "poll", build: (r) => ({ prompt: msg("4-1.check.slow.q"), input: choices(r, "4-1.check.slow", ["kicked", "nothing", "faster"]), answer: "kicked", explain: msg("4-1.check.slow.why") }) },
];

const level41: Level = {
  id: "4-1",
  world: 4,
  title: msg("4-1.title"),
  summary: msg("4-1.summary"),
  topics: [{ name: "orders", partitions: 2 }],
  slots: 9,
  group: { name: "shipping", topic: "orders", options: { maxPollRecords: 1, processMs: 200, pollMs: 400, commit: "after", protocol: "cooperative", rebalanceMs: 600 }, members: 1 },
  steps: [
    {
      kind: "brief",
      title: msg("4-1.brief.title"),
      body: msg("4-1.brief.body"),
      mapping: [
        { icon: "robot", thing: msg("4-1.map.robot"), kafka: msg("4-1.map.consumer") },
        { icon: "next", thing: msg("4-1.map.ask"), kafka: msg("4-1.map.poll") },
        { icon: "package", thing: msg("4-1.map.crate"), kafka: msg("4-1.map.max") },
      ],
      breaks: msg("4-1.brief.breaks"),
    },
    {
      kind: "task",
      title: msg("4-1.keep.title"),
      body: msg("4-1.keep.body"),
      tools: [{ type: "setting", field: "maxPollRecords", options: [1, 3, 5] }],
      onEnter: (ctx) => {
        ctx.bg.autoProduce("orders", 3);
        ctx.bg.watch(() => group(ctx).lag() <= 4);
      },
      meters: (ctx) => [{ label: msg("4-1.keep.meter"), value: group(ctx).lag(), max: 20, danger: 8 }],
      progress: (ctx) => ({ done: Math.min(5, ctx.stats.calm), total: 5 }),
      success: msg("4-1.keep.success"),
    },
    {
      kind: "predict",
      build: () => ({ prompt: msg("4-1.next.q"), input: { type: "number" }, answer: 4, explain: msg("4-1.next.why") }),
    },
    {
      kind: "predict",
      build: (ctx) => ({ prompt: msg("4-1.slow.q"), input: choices(ctx.rng, "4-1.slow", ["kicked", "waits", "skips"]), answer: "kicked", explain: msg("4-1.slow.why") }),
    },
  ],
  check: q41,
};

// ---------------------------------------------------------------- 4-2 Crews

const q42: Question[] = [
  {
    concept: "groups",
    build: (r) => {
      const n = randInt(r, 3, 8), c = n + randInt(r, 1, 4);
      return { prompt: msg("4-2.check.idle.q", { n, c }), input: { type: "number" }, answer: c - n, explain: msg("4-2.check.idle.why", { n, c, idle: c - n }) };
    },
  },
  { concept: "groups", build: (r) => ({ prompt: msg("4-2.check.rule.q"), input: choices(r, "4-2.check.rule", ["one", "many", "all"]), answer: "one", explain: msg("4-2.check.rule.why") }) },
  { concept: "groups", build: (r) => ({ prompt: msg("4-2.check.twoGroups.q"), input: choices(r, "4-2.check.twoGroups", ["both", "split", "first"]), answer: "both", explain: msg("4-2.check.twoGroups.why") }) },
  {
    concept: "groups",
    build: (r) => {
      const c = randInt(r, 2, 3), n = c * 2 + 1;
      return { prompt: msg("4-2.check.range.q", { c, n }), input: { type: "number" }, answer: Math.ceil(n / c), explain: msg("4-2.check.range.why", { c, n, first: Math.ceil(n / c) }) };
    },
  },
];

const level42: Level = {
  id: "4-2",
  world: 4,
  title: msg("4-2.title"),
  summary: msg("4-2.summary"),
  topics: [{ name: "orders", partitions: 4 }],
  slots: 8,
  group: { name: "shipping", topic: "orders", options: { protocol: "eager", rebalanceMs: 900, processMs: 400 }, members: 1 },
  steps: [
    {
      kind: "brief",
      title: msg("4-2.brief.title"),
      body: msg("4-2.brief.body"),
      mapping: [
        { icon: "rows", thing: msg("4-2.map.crew"), kafka: msg("4-2.map.group") },
        { icon: "robot", thing: msg("4-2.map.robot"), kafka: msg("4-2.map.member") },
        { icon: "flag", thing: msg("4-2.map.assigned"), kafka: msg("4-2.map.assignment") },
      ],
    },
    {
      kind: "task",
      title: msg("4-2.hire.title"),
      body: msg("4-2.hire.body"),
      tools: [{ type: "members", actions: ["join"], max: 4 }],
      progress: (ctx) => {
        const g = group(ctx);
        const solo = g.alive.filter((m) => m.partitions.length === 1).length;
        return { done: g.paused.size ? Math.min(3, solo) : solo, total: 4 };
      },
      success: msg("4-2.hire.success"),
    },
    {
      kind: "predict",
      build: () => ({ prompt: msg("4-2.fifth.q"), input: { type: "number" }, answer: 0, explain: msg("4-2.fifth.why"), reveal: async (c) => {
        c.group!.join();
        await c.wait(1300);
      } }),
    },
    { kind: "brief", title: msg("4-2.cooks.title"), body: msg("4-2.cooks.body"), breaks: msg("4-2.cooks.breaks") },
    {
      kind: "predict",
      build: () => ({ prompt: msg("4-2.range.q"), input: { type: "number" }, answer: 2, explain: msg("4-2.range.why") }),
    },
  ],
  check: q42,
};

// ---------------------------------------------------------------- 4-3 New hire (rebalance)

const q43: Question[] = [
  { concept: "rebalance", build: (r) => ({ prompt: msg("4-3.check.eager.q"), input: choices(r, "4-3.check.eager", ["all", "moved", "none"]), answer: "all", explain: msg("4-3.check.eager.why") }) },
  { concept: "rebalance", build: (r) => ({ prompt: msg("4-3.check.coop.q"), input: choices(r, "4-3.check.coop", ["moved", "all", "none"]), answer: "moved", explain: msg("4-3.check.coop.why") }) },
  { concept: "rebalance", build: (r) => ({ prompt: msg("4-3.check.kip.q"), input: choices(r, "4-3.check.kip", ["consumer", "classic", "zk"]), answer: "consumer", explain: msg("4-3.check.kip.why") }) },
  { concept: "rebalance", build: (r) => ({ prompt: msg("4-3.check.static.q"), input: choices(r, "4-3.check.static", ["instance", "session", "partitions"]), answer: "instance", explain: msg("4-3.check.static.why") }) },
];

const level43: Level = {
  id: "4-3",
  world: 4,
  title: msg("4-3.title"),
  summary: msg("4-3.summary"),
  topics: [{ name: "orders", partitions: 4 }],
  slots: 8,
  group: { name: "shipping", topic: "orders", options: { protocol: "eager", rebalanceMs: 2200, processMs: 400 }, members: 2 },
  steps: [
    {
      kind: "brief",
      title: msg("4-3.brief.title"),
      body: msg("4-3.brief.body"),
      mapping: [
        { icon: "robot", thing: msg("4-3.map.shift"), kafka: msg("4-3.map.rebalance") },
        { icon: "clock", thing: msg("4-3.map.paused"), kafka: msg("4-3.map.pausedK") },
      ],
    },
    {
      kind: "watch",
      title: msg("4-3.eager.title"),
      body: msg("4-3.eager.body"),
      script: async (ctx) => {
        await ctx.wait(1500);
        group(ctx).join();
        await ctx.wait(2800);
      },
    },
    {
      kind: "predict",
      build: (ctx) => ({ prompt: msg("4-3.paused.q"), input: choices(ctx.rng, "4-3.paused", ["all", "one", "none"]), answer: "all", explain: msg("4-3.paused.why") }),
    },
    {
      kind: "brief",
      title: msg("4-3.protocols.title"),
      body: msg("4-3.protocols.body"),
      code: "# classic protocol, cooperative rebalancing\npartition.assignment.strategy=org.apache.kafka.clients.consumer.CooperativeStickyAssignor\n\n# KIP-848: the new consumer rebalance protocol (opt-in in 4.x)\ngroup.protocol=consumer",
    },
    {
      kind: "task",
      title: msg("4-3.smooth.title"),
      body: msg("4-3.smooth.body"),
      tools: [{ type: "setting", field: "protocol", options: ["eager", "cooperative", "consumer"] }, { type: "members", actions: ["join", "leave"], max: 4 }],
      onEnter: (ctx) => ctx.bg.autoProduce("orders", 2),
      meters: (ctx) => [{ label: msg("4-3.smooth.meter"), value: group(ctx).lastPaused, max: 4, danger: 2 }],
      progress: (ctx, start) => {
        const g = group(ctx);
        return { done: g.alive.length !== start.members && g.opts.protocol !== "eager" && g.lastPaused <= 1 ? 1 : 0, total: 1 };
      },
      success: msg("4-3.smooth.success"),
    },
    {
      kind: "predict",
      build: (ctx) => ({ prompt: msg("4-3.default.q"), input: choices(ctx.rng, "4-3.default", ["classic", "consumer", "eager"]), answer: "classic", explain: msg("4-3.default.why") }),
    },
  ],
  check: q43,
};

// ---------------------------------------------------------------- 4-4 Bookmarks (commits)

const q44: Question[] = [
  { concept: "commits", build: (r) => ({ prompt: msg("4-4.check.meaning.q"), input: choices(r, "4-4.check.meaning", ["next", "last", "count"]), answer: "next", explain: msg("4-4.check.meaning.why") }) },
  { concept: "commits", build: (r) => ({ prompt: msg("4-4.check.before.q"), input: choices(r, "4-4.check.before", ["atmost", "atleast", "exactly"]), answer: "atmost", explain: msg("4-4.check.before.why") }) },
  { concept: "commits", build: (r) => ({ prompt: msg("4-4.check.reset.q"), input: choices(r, "4-4.check.reset", ["latest", "earliest", "none"]), answer: "latest", explain: msg("4-4.check.reset.why") }) },
  { concept: "commits", build: (r) => ({ prompt: msg("4-4.check.where.q"), input: choices(r, "4-4.check.where", ["offsets", "zk", "consumer"]), answer: "offsets", explain: msg("4-4.check.where.why") }) },
];

const level44: Level = {
  id: "4-4",
  world: 4,
  title: msg("4-4.title"),
  summary: msg("4-4.summary"),
  topics: [{ name: "orders", partitions: 2 }],
  slots: 9,
  group: { name: "billing", topic: "orders", options: { commit: "auto", autoCommitMs: 6000, processMs: 350, pollMs: 200, maxPollRecords: 3, protocol: "cooperative", rebalanceMs: 700 }, members: 1 },
  steps: [
    {
      kind: "brief",
      title: msg("4-4.brief.title"),
      body: msg("4-4.brief.body"),
      mapping: [
        { icon: "flag", thing: msg("4-4.map.flag"), kafka: msg("4-4.map.position") },
        { icon: "note", thing: msg("4-4.map.bookmark"), kafka: msg("4-4.map.committed") },
        { icon: "file", thing: msg("4-4.map.ledger"), kafka: msg("4-4.map.offsets") },
      ],
    },
    {
      kind: "task",
      title: msg("4-4.crash1.title"),
      body: msg("4-4.crash1.body"),
      tools: [{ type: "members", actions: ["crash", "join"], max: 1 }],
      groupStats: true,
      onEnter: (ctx) => ctx.bg.autoProduce("orders", 2),
      progress: (ctx, start) => ({ done: Math.min(1, group(ctx).duplicates - start.groupDups), total: 1 }),
      success: msg("4-4.crash1.success"),
    },
    {
      kind: "predict",
      build: (ctx) => ({ prompt: msg("4-4.before.q"), input: choices(ctx.rng, "4-4.before", ["lost", "dups", "nothing"]), answer: "lost", explain: msg("4-4.before.why") }),
    },
    {
      kind: "task",
      title: msg("4-4.safe.title"),
      body: msg("4-4.safe.body"),
      tools: [{ type: "setting", field: "commit", options: ["auto", "before", "after"] }, { type: "members", actions: ["crash", "join"], max: 1 }],
      groupStats: true,
      onEnter: (ctx) => ctx.bg.autoProduce("orders", 2),
      progress: (ctx, start) => {
        const g = group(ctx);
        const after = g.opts.commit === "after" ? 1 : 0;
        const crashed = g.members.filter((m) => !m.alive).length > start.crashes && g.alive.length > 0 ? 1 : 0;
        const safe = g.lost() === start.groupLost && g.processedCount - start.processed >= 6 ? 1 : 0;
        return { done: after + crashed + (after && crashed ? safe : 0), total: 3 };
      },
      success: msg("4-4.safe.success"),
    },
    {
      kind: "predict",
      build: (ctx) => ({ prompt: msg("4-4.audit.q"), input: choices(ctx.rng, "4-4.audit", ["no", "yes", "half"]), answer: "no", explain: msg("4-4.audit.why") }),
    },
  ],
  check: q44,
};

// ---------------------------------------------------------------- 4-5 Boss: Rush hour

const q45: Question[] = [
  {
    concept: "lag",
    build: (r) => {
      const end = randInt(r, 40, 120), committed = end - randInt(r, 5, 30);
      return { prompt: msg("4-5.check.lag.q", { end, committed }), input: { type: "number" }, answer: end - committed, explain: msg("4-5.check.lag.why", { end, committed, lag: end - committed }) };
    },
  },
  { concept: "lag", build: (r) => ({ prompt: msg("4-5.check.idle.q"), input: choices(r, "4-5.check.idle", ["nothing", "doubles", "halves"]), answer: "nothing", explain: msg("4-5.check.idle.why") }) },
  { concept: "lag", build: (r) => ({ prompt: msg("4-5.check.means.q"), input: choices(r, "4-5.check.means", ["behind", "slow", "lost"]), answer: "behind", explain: msg("4-5.check.means.why") }) },
  {
    concept: "lag",
    build: (r) => {
      const per = [100, 200, 250][randInt(r, 0, 2)], k = randInt(r, 3, 8);
      return { prompt: msg("4-5.check.size.q", { rate: per * k, per }), input: { type: "number" }, answer: k, explain: msg("4-5.check.size.why", { rate: per * k, per, k }) };
    },
  },
];

const level45: Level = {
  id: "4-5",
  world: 4,
  title: msg("4-5.title"),
  summary: msg("4-5.summary"),
  topics: [{ name: "orders", partitions: 3, max: 6 }],
  slots: 8,
  group: { name: "shipping", topic: "orders", options: { processMs: 500, pollMs: 100, maxPollRecords: 5, protocol: "cooperative", commit: "after", rebalanceMs: 600 }, members: 1 },
  steps: [
    {
      kind: "brief",
      title: msg("4-5.brief.title"),
      body: msg("4-5.brief.body"),
      mapping: [{ icon: "counter", thing: msg("4-5.map.waiting"), kafka: msg("4-5.map.lag") }],
      breaks: msg("4-5.brief.breaks"),
    },
    {
      kind: "task",
      title: msg("4-5.rush.title"),
      body: msg("4-5.rush.body"),
      tools: [{ type: "members", actions: ["join"], max: 6 }, { type: "addPartition", topic: "orders", max: 6 }],
      onEnter: (ctx) => {
        ctx.bg.autoProduce("orders", 6);
        ctx.bg.watch(() => group(ctx).lag() <= 6);
      },
      meters: (ctx) => [{ label: msg("4-5.rush.meter"), value: group(ctx).lag(), max: 40, danger: 15 }],
      progress: (ctx) => ({ done: Math.min(8, ctx.stats.calm), total: 8 }),
      success: msg("4-5.rush.success"),
    },
    {
      kind: "predict",
      build: (ctx) => ({ prompt: msg("4-5.fourth.q"), input: choices(ctx.rng, "4-5.fourth", ["idle", "faster", "split"]), answer: "idle", explain: msg("4-5.fourth.why") }),
    },
    { kind: "brief", title: msg("4-5.levers.title"), body: msg("4-5.levers.body"), code: "kafka-consumer-groups.sh --bootstrap-server localhost:9092 \\\n  --describe --group shipping\n\nGROUP     TOPIC   PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG\nshipping  orders  0          1207            1210            3\nshipping  orders  1          1188            1199            11" },
  ],
  check: q45,
};

export const WORLD4: Level[] = [level41, level42, level43, level44, level45];
