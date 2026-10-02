// World 9 — Queues & Performance. Facts: docs/research/kafka-curriculum.md (World 9) and
// src/sim/share.ts: share groups (KIP-932, Kafka 4.x; production-ready in 4.2) let any member take
// any available record, so members can outnumber partitions; records are acquired under a lock
// (30 s default), acknowledged ACCEPT / RELEASE / REJECT, archived at the delivery limit (5); no
// per-key ordering. Performance: sequential I/O + page cache (~600 MB/s linear vs ~100 kB/s random
// in the design docs), zero-copy sendfile (off with TLS), batching. Quotas throttle a client by
// delaying responses (producer_byte_rate / consumer_byte_rate per user or client-id).
import { shareCapacity, throughput } from "@/sim/share";
import { choices, msg, randInt, type Level, type LevelCtx, type Question } from "./types";

const JOBS = { processMs: 900, lockMs: 6000, deliveryLimit: 5, poisonKeys: [] as string[] };
const tput = (ctx: LevelCtx) => throughput(ctx.perf!.settings);
const quotaSplit = (ctx: LevelCtx) => {
  const q = ctx.perf!.quota;
  return shareCapacity(100, [
    { id: "orders", demand: 50 },
    { id: "analytics", demand: 200, quota: q === "none" ? undefined : q },
  ]);
};

// ---------------------------------------------------------------- 9-1 More robots than belts (share groups)

const q91: Question[] = [
  {
    concept: "share-groups",
    build: (r) => {
      const parts = randInt(r, 2, 6), members = parts + randInt(r, 1, 4);
      return { prompt: msg("9-1.check.idle.q", { parts, members }), input: { type: "number" }, answer: members - parts, explain: msg("9-1.check.idle.why", { parts, members, idle: members - parts }) };
    },
  },
  { concept: "share-groups", build: (r) => ({ prompt: msg("9-1.check.order.q"), input: choices(r, "9-1.check.order", ["no", "yes", "key"]), answer: "no", explain: msg("9-1.check.order.why") }) },
  { concept: "share-groups", build: (r) => ({ prompt: msg("9-1.check.when.q"), input: choices(r, "9-1.check.when", ["queue", "ordered", "replay"]), answer: "queue", explain: msg("9-1.check.when.why") }) },
  { concept: "share-groups", build: (r) => ({ prompt: msg("9-1.check.class.q"), input: choices(r, "9-1.check.class", ["share", "consumer", "streams"]), answer: "share", explain: msg("9-1.check.class.why") }) },
];

const level91: Level = {
  id: "9-1",
  world: 9,
  title: msg("9-1.title"),
  summary: msg("9-1.summary"),
  topics: [{ name: "jobs", partitions: 2 }],
  slots: 10,
  share: { topic: "jobs", mode: "classic", members: 4, options: JOBS },
  steps: [
    {
      kind: "brief",
      title: msg("9-1.brief.title"),
      body: msg("9-1.brief.body"),
      mapping: [
        { icon: "robot", thing: msg("9-1.map.robot"), kafka: msg("9-1.map.consumer") },
        { icon: "package", thing: msg("9-1.map.next"), kafka: msg("9-1.map.share") },
      ],
      code: 'var consumer = new KafkaShareConsumer<String, String>(props); // group.id=workers\nconsumer.subscribe(List.of("jobs"));\nfor (var r : consumer.poll(Duration.ofMillis(100))) process(r);',
    },
    {
      kind: "watch",
      title: msg("9-1.classic.title"),
      body: msg("9-1.classic.body"),
      streams: "share",
      script: async (ctx) => {
        for (let i = 0; i < 10; i++) {
          await ctx.produce("jobs", `job-${i + 1}`, "job", i % 2);
          await ctx.wait(250);
        }
        await ctx.wait(2500);
      },
    },
    {
      kind: "predict",
      build: () => ({ prompt: msg("9-1.idle.q"), input: { type: "number" }, answer: 2, explain: msg("9-1.idle.why") }),
    },
    {
      kind: "task",
      title: msg("9-1.switch.title"),
      body: msg("9-1.switch.body"),
      streams: "share",
      tools: [{ type: "setting", field: "groupType", options: ["classic", "share"] }],
      onEnter: (ctx) => ctx.bg.autoProduce("jobs", 5),
      meters: (ctx) => [{ label: msg("9-1.meter"), value: Math.round(ctx.share!.rate * 10) / 10, max: 5, danger: 99, unit: "/s" }],
      progress: (ctx) => ({ done: (ctx.share!.mode === "share" ? 1 : 0) + (ctx.share!.mode === "share" && ctx.share!.rate >= 3.4 ? 1 : 0), total: 2 }),
      success: msg("9-1.switch.success"),
    },
    {
      kind: "predict",
      build: (ctx) => ({ prompt: msg("9-1.order.q"), input: choices(ctx.rng, "9-1.order", ["no", "yes", "partition"]), answer: "no", explain: msg("9-1.order.why") }),
    },
  ],
  check: q91,
};

// ---------------------------------------------------------------- 9-2 Locks and retries

const q92: Question[] = [
  { concept: "share-locks", build: (r) => ({ prompt: msg("9-2.check.reject.q"), input: choices(r, "9-2.check.reject", ["reject", "release", "accept"]), answer: "reject", explain: msg("9-2.check.reject.why") }) },
  { concept: "share-locks", build: (r) => ({ prompt: msg("9-2.check.crash.q"), input: choices(r, "9-2.check.crash", ["lock", "now", "never"]), answer: "lock", explain: msg("9-2.check.crash.why") }) },
  {
    concept: "share-locks",
    build: (r) => {
      const limit = 5, done = randInt(r, 1, 4);
      return { prompt: msg("9-2.check.left.q", { done, limit }), input: { type: "number" }, answer: limit - done, explain: msg("9-2.check.left.why", { done, limit, left: limit - done }) };
    },
  },
  { concept: "share-locks", build: (r) => ({ prompt: msg("9-2.check.release.q"), input: choices(r, "9-2.check.release", ["again", "gone", "dlq"]), answer: "again", explain: msg("9-2.check.release.why") }) },
];

const level92: Level = {
  id: "9-2",
  world: 9,
  title: msg("9-2.title"),
  summary: msg("9-2.summary"),
  topics: [{ name: "jobs", partitions: 1 }],
  slots: 10,
  share: { topic: "jobs", mode: "share", members: 3, options: { processMs: 900, lockMs: 4000, deliveryLimit: 5, poisonKeys: ["bad-pdf"] } },
  steps: [
    {
      kind: "brief",
      title: msg("9-2.brief.title"),
      body: msg("9-2.brief.body"),
      mapping: [
        { icon: "clock", thing: msg("9-2.map.timer"), kafka: msg("9-2.map.lock") },
        { icon: "counter", thing: msg("9-2.map.stamps"), kafka: msg("9-2.map.count") },
        { icon: "file", thing: msg("9-2.map.pile"), kafka: msg("9-2.map.archived") },
      ],
      code: "consumer.acknowledge(record, AcknowledgeType.ACCEPT);  // done\nconsumer.acknowledge(record, AcknowledgeType.RELEASE); // try again later\nconsumer.acknowledge(record, AcknowledgeType.REJECT);  // can't be processed\nconsumer.commitSync();",
    },
    {
      kind: "watch",
      title: msg("9-2.crash.title"),
      body: msg("9-2.crash.body"),
      streams: "share",
      script: async (ctx) => {
        for (let i = 0; i < 3; i++) await ctx.produce("jobs", `job-${i + 1}`, "job");
        await ctx.wait(300);
        ctx.share!.crash();
        await ctx.wait(5600);
      },
    },
    {
      kind: "predict",
      build: (ctx) => ({ prompt: msg("9-2.poison.q"), input: choices(ctx.rng, "9-2.poison", ["archived", "forever", "blocks"]), answer: "archived", explain: msg("9-2.poison.why") }),
    },
    {
      kind: "task",
      title: msg("9-2.reject.title"),
      body: msg("9-2.reject.body"),
      streams: "share",
      tools: [
        { type: "setting", field: "onFailure", options: ["release", "reject"] },
        { type: "actions", ids: ["shareJoin"] },
      ],
      onEnter: (ctx) => {
        ctx.bg.autoProduce("jobs", 1.5);
        ctx.bg.every(5000, () => void ctx.produce("jobs", "bad-pdf", "corrupt"));
      },
      progress: (ctx) => {
        const g = ctx.share!;
        const rejected = [...g.records.values()].some((r) => r.state === "archived" && r.deliveries === 1);
        return { done: (rejected ? 1 : 0) + Math.min(1, Math.floor(g.processed / 10)), total: 2 };
      },
      success: msg("9-2.reject.success"),
    },
    {
      kind: "predict",
      build: (ctx) => ({ prompt: msg("9-2.lock.q"), input: choices(ctx.rng, "9-2.lock", ["expires", "now", "never"]), answer: "expires", explain: msg("9-2.lock.why") }),
    },
  ],
  check: q92,
};

// ---------------------------------------------------------------- 9-3 Why Kafka is fast

const q93: Question[] = [
  { concept: "performance", build: (r) => ({ prompt: msg("9-3.check.seq.q"), input: choices(r, "9-3.check.seq", ["append", "index", "memory"]), answer: "append", explain: msg("9-3.check.seq.why") }) },
  { concept: "performance", build: (r) => ({ prompt: msg("9-3.check.zero.q"), input: choices(r, "9-3.check.zero", ["socket", "heap", "disk"]), answer: "socket", explain: msg("9-3.check.zero.why") }) },
  { concept: "performance", build: (r) => ({ prompt: msg("9-3.check.tls.q"), input: choices(r, "9-3.check.tls", ["off", "on", "faster"]), answer: "off", explain: msg("9-3.check.tls.why") }) },
  { concept: "performance", build: (r) => ({ prompt: msg("9-3.check.cache.q"), input: choices(r, "9-3.check.cache", ["os", "heap", "none"]), answer: "os", explain: msg("9-3.check.cache.why") }) },
];

const perfTools = [
  { type: "setting" as const, field: "sequential" as const, options: [false, true] },
  { type: "setting" as const, field: "batch" as const, options: [1, 10, 100] },
  { type: "setting" as const, field: "zeroCopy" as const, options: [false, true] },
  { type: "setting" as const, field: "tls" as const, options: [false, true] },
];
const perfMeter = (ctx: LevelCtx) => [{ label: msg("9-3.meter"), value: tput(ctx), max: 600, danger: 9999, unit: "MB/s" }];
// Boxes flow onto the belt in proportion to the throughput
const perfFlow = (ctx: LevelCtx) => ctx.bg.every(260, () => ctx.rng() < tput(ctx) / 600 && void ctx.produce("orders", null));

const level93: Level = {
  id: "9-3",
  world: 9,
  title: msg("9-3.title"),
  summary: msg("9-3.summary"),
  topics: [{ name: "orders", partitions: 1 }],
  slots: 12,
  perf: true,
  steps: [
    {
      kind: "brief",
      title: msg("9-3.brief.title"),
      body: msg("9-3.brief.body"),
      mapping: [
        { icon: "note", thing: msg("9-3.map.notebook"), kafka: msg("9-3.map.append") },
        { icon: "next", thing: msg("9-3.map.chute"), kafka: msg("9-3.map.zero") },
        { icon: "package", thing: msg("9-3.map.truck"), kafka: msg("9-3.map.batch") },
      ],
    },
    {
      kind: "predict",
      build: (ctx) => ({ prompt: msg("9-3.gap.q"), input: choices(ctx.rng, "9-3.gap", ["thousands", "double", "same"]), answer: "thousands", explain: msg("9-3.gap.why") }),
    },
    {
      kind: "task",
      title: msg("9-3.max.title"),
      body: msg("9-3.max.body"),
      tools: perfTools,
      onEnter: perfFlow,
      meters: perfMeter,
      progress: (ctx) => ({ done: tput(ctx) >= 500 ? 1 : 0, total: 1 }),
      success: msg("9-3.max.success"),
    },
    {
      kind: "predict",
      build: (ctx) => ({ prompt: msg("9-3.tls.q"), input: choices(ctx.rng, "9-3.tls", ["off", "same", "faster"]), answer: "off", explain: msg("9-3.tls.why") }),
    },
    {
      kind: "task",
      title: msg("9-3.secure.title"),
      body: msg("9-3.secure.body"),
      tools: perfTools,
      onEnter: perfFlow,
      meters: perfMeter,
      progress: (ctx) => ({ done: (ctx.perf!.settings.tls ? 1 : 0) + (ctx.perf!.settings.tls && tput(ctx) >= 300 ? 1 : 0), total: 2 }),
      success: msg("9-3.secure.success"),
    },
  ],
  check: q93,
};

// ---------------------------------------------------------------- 9-4 The noisy neighbour (quotas)

const q94: Question[] = [
  { concept: "quotas", build: (r) => ({ prompt: msg("9-4.check.how.q"), input: choices(r, "9-4.check.how", ["delay", "drop", "kick"]), answer: "delay", explain: msg("9-4.check.how.why") }) },
  { concept: "quotas", build: (r) => ({ prompt: msg("9-4.check.who.q"), input: choices(r, "9-4.check.who", ["client", "topic", "partition"]), answer: "client", explain: msg("9-4.check.who.why") }) },
  {
    concept: "quotas",
    build: (r) => {
      const mb = [10, 20, 50][randInt(r, 0, 2)];
      return { prompt: msg("9-4.check.bytes.q", { mb }), input: { type: "number" }, answer: mb * 1048576, explain: msg("9-4.check.bytes.why", { mb, bytes: mb * 1048576 }) };
    },
  },
  { concept: "quotas", build: (r) => ({ prompt: msg("9-4.check.sees.q"), input: choices(r, "9-4.check.sees", ["slower", "errors", "nothing"]), answer: "slower", explain: msg("9-4.check.sees.why") }) },
];

const quotaMeters = (ctx: LevelCtx) => {
  const s = quotaSplit(ctx);
  return [
    { label: msg("9-4.meter.orders"), value: s.get("orders")!.got, max: 100, danger: 9999, unit: "MB/s" },
    { label: msg("9-4.meter.analytics"), value: s.get("analytics")!.got, max: 100, danger: 9999, unit: "MB/s" },
    { label: msg("9-4.meter.throttle"), value: s.get("analytics")!.throttleMs, max: 10000, danger: 1, unit: "ms" },
  ];
};
// Boxes per topic follow each client's share of the broker
const quotaFlow = (ctx: LevelCtx) =>
  ctx.bg.every(300, () => {
    const s = quotaSplit(ctx);
    if (ctx.rng() < s.get("orders")!.got / 100) void ctx.produce("orders", null);
    if (ctx.rng() < s.get("analytics")!.got / 100) void ctx.produce("analytics", null);
  });

const level94: Level = {
  id: "9-4",
  world: 9,
  title: msg("9-4.title"),
  summary: msg("9-4.summary"),
  topics: [
    { name: "orders", partitions: 1 },
    { name: "analytics", partitions: 1 },
  ],
  slots: 12,
  perf: true,
  steps: [
    {
      kind: "brief",
      title: msg("9-4.brief.title"),
      body: msg("9-4.brief.body"),
      mapping: [
        { icon: "sign", thing: msg("9-4.map.limit"), kafka: msg("9-4.map.quota") },
        { icon: "clock", thing: msg("9-4.map.wait"), kafka: msg("9-4.map.throttle") },
      ],
      code: "kafka-configs.sh --bootstrap-server broker:9092 --alter \\\n  --add-config 'producer_byte_rate=52428800' \\\n  --entity-type clients --entity-name analytics",
    },
    {
      kind: "task",
      title: msg("9-4.look.title"),
      body: msg("9-4.look.body"),
      tools: [],
      onEnter: quotaFlow,
      meters: quotaMeters,
      progress: (ctx) => ({ done: ctx.cluster.topic("analytics").partitions[0].length >= 6 ? 1 : 0, total: 1 }),
      success: msg("9-4.look.success"),
    },
    {
      kind: "predict",
      build: (ctx) => ({ prompt: msg("9-4.how.q"), input: choices(ctx.rng, "9-4.how", ["delay", "drop", "kick"]), answer: "delay", explain: msg("9-4.how.why") }),
    },
    {
      kind: "task",
      title: msg("9-4.cap.title"),
      body: msg("9-4.cap.body"),
      tools: [{ type: "setting", field: "quota", options: ["none", 50, 20] }],
      onEnter: quotaFlow,
      meters: quotaMeters,
      progress: (ctx) => ({ done: quotaSplit(ctx).get("orders")!.got >= 50 ? 1 : 0, total: 1 }),
      success: msg("9-4.cap.success"),
    },
    {
      kind: "predict",
      build: (ctx) => ({ prompt: msg("9-4.sees.q"), input: choices(ctx.rng, "9-4.sees", ["slower", "errors", "nothing"]), answer: "slower", explain: msg("9-4.sees.why") }),
    },
  ],
  check: q94,
};

export const WORLD9: Level[] = [level91, level92, level93, level94];
