// World 8 — Streams & Connect. Facts: docs/research/kafka-curriculum.md (World 10 — Ecosystem) and
// src/sim/streams.ts: Connect source connectors keep their position in an offsets topic flushed
// periodically (offset.flush.interval.ms 60 s), so a crash re-sends unflushed rows; sink connectors
// are consumer groups. Kafka Streams is a library; application.id is its group id; a KTable is an
// upsert view where a null value deletes; state stores are backed by compacted changelog topics
// (<application.id>-<store>-changelog) and restored from them; windows use event time and drop
// records that arrive after window end + grace. Game time is in seconds for readability.
import { choices, msg, randInt, type Level, type Question } from "./types";

const CITIES = ["Lima", "Quito", "Madrid", "Austin", "Bogotá", "Porto"];

// ---------------------------------------------------------------- 8-1 Pipes from the database (Connect)

const q81: Question[] = [
  { concept: "connect", build: (r) => ({ prompt: msg("8-1.check.where.q"), input: choices(r, "8-1.check.where", ["topic", "memory", "db"]), answer: "topic", explain: msg("8-1.check.where.why") }) },
  { concept: "connect", build: (r) => ({ prompt: msg("8-1.check.sink.q"), input: choices(r, "8-1.check.sink", ["group", "broker", "leader"]), answer: "group", explain: msg("8-1.check.sink.why") }) },
  { concept: "connect", build: (r) => ({ prompt: msg("8-1.check.what.q"), input: choices(r, "8-1.check.what", ["framework", "plugin", "database"]), answer: "framework", explain: msg("8-1.check.what.why") }) },
  {
    concept: "connect",
    build: (r) => {
      const flush = randInt(r, 3, 5), flushed = flush * randInt(r, 1, 3), extra = randInt(r, 1, flush - 1), copied = flushed + extra;
      return { prompt: msg("8-1.check.dups.q", { flush, copied, flushed }), input: { type: "number" }, answer: extra, explain: msg("8-1.check.dups.why", { flushed, copied, extra }) };
    },
  },
];

const level81: Level = {
  id: "8-1",
  world: 8,
  title: msg("8-1.title"),
  summary: msg("8-1.summary"),
  topics: [
    { name: "db-customers", partitions: 1 },
    { name: "connect-offsets", partitions: 1 },
  ],
  slots: 10,
  streams: {
    connector: {
      name: "jdbc-customers",
      topic: "db-customers",
      offsetsTopic: "connect-offsets",
      flushEvery: 3,
      rows: CITIES.slice(0, 5).map((value, i) => ({ id: `customer-${i + 1}`, value })),
    },
  },
  steps: [
    {
      kind: "brief",
      title: msg("8-1.brief.title"),
      body: msg("8-1.brief.body"),
      mapping: [
        { icon: "database", thing: msg("8-1.map.db"), kafka: msg("8-1.map.source") },
        { icon: "plug", thing: msg("8-1.map.pipe"), kafka: msg("8-1.map.connector") },
        { icon: "note", thing: msg("8-1.map.bookmark"), kafka: msg("8-1.map.offsets") },
      ],
      code: "name=jdbc-customers\nconnector.class=io.confluent.connect.jdbc.JdbcSourceConnector\nmode=incrementing\nincrementing.column.name=id\ntopic.prefix=db-\ntasks.max=1",
    },
    {
      kind: "watch",
      title: msg("8-1.copy.title"),
      body: msg("8-1.copy.body"),
      streams: "connect",
      script: async (ctx) => {
        ctx.connector!.restart();
        await ctx.wait(5200);
        ctx.connector!.insert({ id: "customer-6", value: CITIES[5] });
        await ctx.wait(1400);
      },
    },
    {
      kind: "predict",
      build: (ctx) => ({ prompt: msg("8-1.resume.q"), input: choices(ctx.rng, "8-1.resume", ["flushed", "where", "start"]), answer: "flushed", explain: msg("8-1.resume.why") }),
    },
    {
      kind: "task",
      title: msg("8-1.crash.title"),
      body: msg("8-1.crash.body"),
      streams: "connect",
      tools: [{ type: "actions", ids: ["dbInsert", "connectorCrash", "connectorRestart"] }],
      progress: (ctx) => {
        const c = ctx.connector!;
        return { done: (c.duplicates > 0 ? 1 : 0) + (c.duplicates > 0 && c.running && c.pending === 0 ? 1 : 0), total: 2 };
      },
      success: msg("8-1.crash.success"),
    },
    {
      kind: "predict",
      build: (ctx) => ({ prompt: msg("8-1.fix.q"), input: choices(ctx.rng, "8-1.fix", ["upsert", "partitions", "never"]), answer: "upsert", explain: msg("8-1.fix.why") }),
    },
  ],
  check: q81,
};

// ---------------------------------------------------------------- 8-2 Stream or table? (KStream vs KTable)

const q82: Question[] = [
  { concept: "ktable", build: (r) => ({ prompt: msg("8-2.check.upsert.q"), input: choices(r, "8-2.check.upsert", ["upsert", "append", "ignore"]), answer: "upsert", explain: msg("8-2.check.upsert.why") }) },
  { concept: "ktable", build: (r) => ({ prompt: msg("8-2.check.null.q"), input: choices(r, "8-2.check.null", ["delete", "store", "error"]), answer: "delete", explain: msg("8-2.check.null.why") }) },
  {
    concept: "ktable",
    build: (r) => {
      const keys = randInt(r, 2, 5), events = keys + randInt(r, 2, 6);
      return { prompt: msg("8-2.check.rows.q", { keys, events }), input: { type: "number" }, answer: keys, explain: msg("8-2.check.rows.why", { keys, events }) };
    },
  },
  { concept: "ktable", build: (r) => ({ prompt: msg("8-2.check.library.q"), input: choices(r, "8-2.check.library", ["library", "cluster", "broker"]), answer: "library", explain: msg("8-2.check.library.why") }) },
];

const level82: Level = {
  id: "8-2",
  world: 8,
  title: msg("8-2.title"),
  summary: msg("8-2.summary"),
  topics: [{ name: "addresses", partitions: 1 }],
  slots: 10,
  steps: [
    {
      kind: "brief",
      title: msg("8-2.brief.title"),
      body: msg("8-2.brief.body"),
      mapping: [
        { icon: "rows", thing: msg("8-2.map.diary"), kafka: msg("8-2.map.stream") },
        { icon: "table", thing: msg("8-2.map.book"), kafka: msg("8-2.map.table") },
      ],
      breaks: msg("8-2.brief.breaks"),
      code: 'KStream<String, String> moves = builder.stream("addresses");\nKTable<String, String> book = builder.table("addresses");',
    },
    {
      kind: "watch",
      title: msg("8-2.moves.title"),
      body: msg("8-2.moves.body"),
      streams: "table",
      script: async (ctx) => {
        for (const [k, v] of [["alice", "Lima"], ["bob", "Quito"], ["alice", "Madrid"], ["carol", "Austin"], ["bob", "Bogotá"]]) {
          await ctx.produce("addresses", k, v);
          await ctx.wait(350);
        }
      },
    },
    {
      kind: "predict",
      build: () => ({ prompt: msg("8-2.rows.q"), input: { type: "number" }, answer: 3, explain: msg("8-2.rows.why") }),
    },
    {
      kind: "predict",
      build: (ctx) => ({
        prompt: msg("8-2.again.q"),
        input: choices(ctx.rng, "8-2.again", ["porto", "both", "lima"]),
        answer: "porto",
        explain: msg("8-2.again.why"),
        reveal: (c) => c.produce("addresses", "alice", "Porto"),
      }),
    },
    {
      kind: "task",
      title: msg("8-2.delete.title"),
      body: msg("8-2.delete.body"),
      streams: "table",
      tools: [
        { type: "produce", topic: "addresses", keys: ["dave", "erin"], values: CITIES },
        { type: "tombstone", topic: "addresses", keys: ["bob", "carol"] },
      ],
      progress: (ctx, start) => {
        const t = ctx.cluster.topic("addresses").partitions[0];
        const tomb = t.some((r) => r.value === "" && (r.key === "bob" || r.key === "carol"));
        const added = t.filter((r) => r.key === "dave" || r.key === "erin").length;
        return { done: (tomb ? 1 : 0) + Math.min(1, added) + (ctx.stats.produced - start.produced >= 3 ? 1 : 0), total: 3 };
      },
      success: msg("8-2.delete.success"),
    },
  ],
  check: q82,
};

// ---------------------------------------------------------------- 8-3 State that survives (state stores + changelog)

const q83: Question[] = [
  { concept: "state", build: (r) => ({ prompt: msg("8-3.check.where.q"), input: choices(r, "8-3.check.where", ["both", "broker", "memory"]), answer: "both", explain: msg("8-3.check.where.why") }) },
  { concept: "state", build: (r) => ({ prompt: msg("8-3.check.group.q"), input: choices(r, "8-3.check.group", ["appid", "random", "topic"]), answer: "appid", explain: msg("8-3.check.group.why") }) },
  {
    concept: "state",
    build: (r) => {
      const keys = randInt(r, 2, 6), updates = keys * randInt(r, 3, 9);
      return { prompt: msg("8-3.check.compact.q", { keys, updates }), input: { type: "number" }, answer: keys, explain: msg("8-3.check.compact.why", { keys, updates }) };
    },
  },
  { concept: "state", build: (r) => ({ prompt: msg("8-3.check.restore.q"), input: choices(r, "8-3.check.restore", ["changelog", "input", "db"]), answer: "changelog", explain: msg("8-3.check.restore.why") }) },
];

const level83: Level = {
  id: "8-3",
  world: 8,
  title: msg("8-3.title"),
  summary: msg("8-3.summary"),
  topics: [
    { name: "clicks", partitions: 1 },
    { name: "click-counter-counts-changelog", partitions: 1 },
  ],
  slots: 10,
  streams: { app: { appId: "click-counter", input: "clicks", changelog: "click-counter-counts-changelog" } },
  steps: [
    {
      kind: "brief",
      title: msg("8-3.brief.title"),
      body: msg("8-3.brief.body"),
      mapping: [
        { icon: "note", thing: msg("8-3.map.notebook"), kafka: msg("8-3.map.store") },
        { icon: "file", thing: msg("8-3.map.copy"), kafka: msg("8-3.map.changelog") },
      ],
      code: 'builder.stream("clicks")\n  .groupByKey()\n  .count(Materialized.as("counts"));\n// state store "counts" → topic click-counter-counts-changelog',
    },
    {
      kind: "watch",
      title: msg("8-3.count.title"),
      body: msg("8-3.count.body"),
      streams: "store",
      script: async (ctx) => {
        for (const k of ["alice", "bob", "alice", "carol", "alice"]) {
          await ctx.produce("clicks", k, "click");
          await ctx.wait(450);
        }
        await ctx.wait(900);
      },
    },
    {
      kind: "predict",
      build: (ctx) => ({ prompt: msg("8-3.crash.q"), input: choices(ctx.rng, "8-3.crash", ["same", "zero", "never"]), answer: "same", explain: msg("8-3.crash.why") }),
    },
    {
      kind: "task",
      title: msg("8-3.restore.title"),
      body: msg("8-3.restore.body"),
      streams: "store",
      tools: [
        { type: "produce", topic: "clicks", keys: ["alice", "bob", "carol"], values: ["click"] },
        { type: "actions", ids: ["appCrash", "appRestart"] },
      ],
      progress: (ctx, start) => {
        const a = ctx.app!;
        const clicks = ctx.cluster.topic("clicks").partitions[0].length;
        const total = [...a.store.values()].reduce((x, y) => x + y, 0);
        const restored = a.restores > 0 ? 1 : 0;
        return { done: restored + (ctx.stats.produced - start.produced >= 2 ? 1 : 0) + (restored && a.running && total === clicks ? 1 : 0), total: 3 };
      },
      success: msg("8-3.restore.success"),
    },
    {
      kind: "predict",
      build: (ctx) => ({ prompt: msg("8-3.compact.q"), input: choices(ctx.rng, "8-3.compact", ["latest", "money", "order"]), answer: "latest", explain: msg("8-3.compact.why") }),
    },
  ],
  check: q83,
};

// ---------------------------------------------------------------- 8-4 Time windows (tumbling windows + grace)

const q84: Question[] = [
  { concept: "windows", build: (r) => ({ prompt: msg("8-4.check.kind.q"), input: choices(r, "8-4.check.kind", ["tumbling", "hopping", "session"]), answer: "tumbling", explain: msg("8-4.check.kind.why") }) },
  {
    concept: "windows",
    build: (r) => {
      const size = [10, 30, 60][randInt(r, 0, 2)], ts = randInt(r, 1, 9) * size + randInt(r, 1, size - 1), start = Math.floor(ts / size) * size;
      return { prompt: msg("8-4.check.start.q", { size, ts }), input: { type: "number" }, answer: start, explain: msg("8-4.check.start.why", { size, ts, start, end: start + size }) };
    },
  },
  {
    concept: "windows",
    build: (r) => {
      const size = 10, start = randInt(r, 1, 9) * size, grace = randInt(r, 1, 6) * 5;
      return { prompt: msg("8-4.check.close.q", { start, end: start + size, grace }), input: { type: "number" }, answer: start + size + grace, explain: msg("8-4.check.close.why", { end: start + size, grace, close: start + size + grace }) };
    },
  },
  { concept: "windows", build: (r) => ({ prompt: msg("8-4.check.time.q"), input: choices(r, "8-4.check.time", ["event", "arrival", "reader"]), answer: "event", explain: msg("8-4.check.time.why") }) },
];

const level84: Level = {
  id: "8-4",
  world: 8,
  title: msg("8-4.title"),
  summary: msg("8-4.summary"),
  topics: [{ name: "clicks", partitions: 1 }],
  slots: 12,
  streams: { windows: { topic: "clicks", size: 10, grace: 0 } },
  steps: [
    {
      kind: "brief",
      title: msg("8-4.brief.title"),
      body: msg("8-4.brief.body"),
      mapping: [
        { icon: "timer", thing: msg("8-4.map.shift"), kafka: msg("8-4.map.window") },
        { icon: "clock", thing: msg("8-4.map.stamp"), kafka: msg("8-4.map.eventTime") },
        { icon: "flag", thing: msg("8-4.map.late"), kafka: msg("8-4.map.grace") },
      ],
      code: ".groupByKey()\n.windowedBy(TimeWindows.ofSizeAndGrace(\n    Duration.ofSeconds(10), Duration.ofSeconds(5)))\n.count();",
    },
    {
      kind: "watch",
      title: msg("8-4.fill.title"),
      body: msg("8-4.fill.body"),
      streams: "windows",
      script: async (ctx) => {
        for (const k of ["alice", "bob", "carol", "alice"]) {
          ctx.windows!.send(k, 0);
          await ctx.wait(700);
        }
      },
    },
    {
      kind: "predict",
      build: (ctx) => ({
        prompt: msg("8-4.late.q"),
        input: choices(ctx.rng, "8-4.late", ["dropped", "first", "second"]),
        answer: "dropped",
        explain: msg("8-4.late.why"),
        reveal: async (c) => {
          c.windows!.send("dave", 5);
          await c.wait(900);
        },
      }),
    },
    {
      kind: "task",
      title: msg("8-4.grace.title"),
      body: msg("8-4.grace.body"),
      streams: "windows",
      tools: [
        { type: "setting", field: "grace", options: [0, 5, 10, 30] },
        { type: "actions", ids: ["eventNow", "eventLate5", "eventLate15"] },
      ],
      onEnter: (ctx) => {
        ctx.windows!.dropped = 0;
        ctx.windows!.lateAccepted = 0;
      },
      progress: (ctx) => {
        const w = ctx.windows!;
        return { done: (w.grace > 0 && w.lateAccepted > 0 ? 1 : 0) + (w.grace > 0 && w.dropped > 0 ? 1 : 0), total: 2 };
      },
      success: msg("8-4.grace.success"),
    },
    {
      kind: "predict",
      build: (ctx) => ({ prompt: msg("8-4.hour.q"), input: choices(ctx.rng, "8-4.hour", ["wait", "forbidden", "drops"]), answer: "wait", explain: msg("8-4.hour.why") }),
    },
  ],
  check: q84,
};

export const WORLD8: Level[] = [level81, level82, level83, level84];
