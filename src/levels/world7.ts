// World 7 — Retention, compaction & tiered storage. Facts: docs/research/kafka-curriculum.md
// (Retention deep-dive): segments (segment.bytes 1 GiB / segment.ms 7 d), only the active segment is
// written, cleanup.policy=delete deletes whole closed segments (retention.ms 7 d, retention.bytes −1),
// offsets are never reused, consumers below the log start get OffsetOutOfRange → auto.offset.reset,
// compaction keeps the latest record per key (never the active segment, offsets keep gaps),
// tombstones (null value) kept for delete.retention.ms (1 d), tiered storage (GA in 3.9) offloads
// closed segments, served by the broker, not for compacted topics. Segment size counted in records.
import { COLORS } from "@/stage/theme";
import { choices, msg, randInt, type Level, type Question } from "./types";

const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
const AUDIT = { group: "audit", label: "Audit", color: "#8b5cf6" };
const ARCHIVE = { group: "archive", label: "Archive", color: hex(COLORS.consumer) };

// ---------------------------------------------------------------- 7-1 Segments

const q71: Question[] = [
  {
    concept: "segments",
    build: (r) => {
      const size = randInt(r, 3, 6), n = size * randInt(r, 2, 4) + randInt(r, 1, size - 1);
      return { prompt: msg("7-1.check.count.q", { size, n }), input: { type: "number" }, answer: Math.ceil(n / size), explain: msg("7-1.check.count.why", { size, n, segs: Math.ceil(n / size) }) };
    },
  },
  { concept: "segments", build: (r) => ({ prompt: msg("7-1.check.write.q"), input: choices(r, "7-1.check.write", ["active", "oldest", "any"]), answer: "active", explain: msg("7-1.check.write.why") }) },
  { concept: "segments", build: (r) => ({ prompt: msg("7-1.check.roll.q"), input: choices(r, "7-1.check.roll", ["gib", "mb", "records"]), answer: "gib", explain: msg("7-1.check.roll.why") }) },
  { concept: "retention", build: (r) => ({ prompt: msg("7-1.check.unit.q"), input: choices(r, "7-1.check.unit", ["segments", "records", "keys"]), answer: "segments", explain: msg("7-1.check.unit.why") }) },
];

const level71: Level = {
  id: "7-1",
  world: 7,
  title: msg("7-1.title"),
  summary: msg("7-1.summary"),
  topics: [{ name: "orders", partitions: 1 }],
  slots: 13,
  storage: { topic: "orders", options: { segmentSize: 4, policy: "delete" } },
  steps: [
    {
      kind: "brief",
      title: msg("7-1.brief.title"),
      body: msg("7-1.brief.body"),
      mapping: [
        { icon: "file", thing: msg("7-1.map.chapter"), kafka: msg("7-1.map.segment") },
        { icon: "note", thing: msg("7-1.map.current"), kafka: msg("7-1.map.active") },
      ],
      breaks: msg("7-1.brief.breaks"),
    },
    {
      kind: "watch",
      title: msg("7-1.fill.title"),
      body: msg("7-1.fill.body"),
      script: async (ctx) => {
        for (const k of ["alice", "bob", "carol", "dave", "erin", "alice", "bob", "carol", "dave", "erin"]) {
          await ctx.produce("orders", k);
          await ctx.wait(80);
        }
      },
    },
    {
      kind: "predict",
      build: () => ({ prompt: msg("7-1.count.q"), input: { type: "number" }, answer: 4, explain: msg("7-1.count.why") }),
    },
    {
      kind: "predict",
      build: (ctx) => ({ prompt: msg("7-1.where.q"), input: choices(ctx.rng, "7-1.where", ["active", "oldest", "any"]), answer: "active", explain: msg("7-1.where.why") }),
    },
    {
      kind: "task",
      title: msg("7-1.roll.title"),
      body: msg("7-1.roll.body"),
      tools: [{ type: "produce", topic: "orders", keys: ["alice", "bob", "carol"] }],
      progress: (ctx) => ({ done: Math.min(1, Math.max(0, ctx.log!.segments(0).length - 3)), total: 1 }),
      success: msg("7-1.roll.success"),
    },
  ],
  check: q71,
};

// ---------------------------------------------------------------- 7-2 Out with the old (retention)

const q72: Question[] = [
  { concept: "retention", build: (r) => ({ prompt: msg("7-2.check.whole.q"), input: choices(r, "7-2.check.whole", ["whole", "each", "keys"]), answer: "whole", explain: msg("7-2.check.whole.why") }) },
  {
    concept: "retention",
    build: (r) => {
      const end = randInt(r, 20, 90);
      return { prompt: msg("7-2.check.reuse.q", { end }), input: { type: "number" }, answer: end, explain: msg("7-2.check.reuse.why", { end }) };
    },
  },
  { concept: "retention", build: (r) => ({ prompt: msg("7-2.check.default.q"), input: choices(r, "7-2.check.default", ["week", "day", "forever"]), answer: "week", explain: msg("7-2.check.default.why") }) },
  { concept: "retention", build: (r) => ({ prompt: msg("7-2.check.oor.q"), input: choices(r, "7-2.check.oor", ["reset", "crash", "waits"]), answer: "reset", explain: msg("7-2.check.oor.why") }) },
];

const level72: Level = {
  id: "7-2",
  world: 7,
  title: msg("7-2.title"),
  summary: msg("7-2.summary"),
  topics: [{ name: "orders", partitions: 1 }],
  slots: 13,
  consumers: [AUDIT],
  storage: { topic: "orders", options: { segmentSize: 4, policy: "delete" } },
  steps: [
    {
      kind: "brief",
      title: msg("7-2.brief.title"),
      body: msg("7-2.brief.body"),
      mapping: [
        { icon: "file", thing: msg("7-2.map.shred"), kafka: msg("7-2.map.delete") },
        { icon: "hash", thing: msg("7-2.map.firstPage"), kafka: msg("7-2.map.logStart") },
      ],
      code: "cleanup.policy=delete\nretention.ms=604800000   # 7 days (default)\nretention.bytes=-1       # no size limit (default)",
    },
    {
      kind: "watch",
      title: msg("7-2.fill.title"),
      body: msg("7-2.fill.body"),
      script: async (ctx) => {
        for (let i = 0; i < 11; i++) {
          await ctx.produce("orders", ["alice", "bob", "carol", "dave"][i % 4]);
          await ctx.wait(70);
          if (i === 1) await ctx.fetch("audit", "orders", 0);
        }
      },
    },
    {
      kind: "task",
      title: msg("7-2.room.title"),
      body: msg("7-2.room.body"),
      tools: [{ type: "setting", field: "retainSegments", options: ["all", 3, 2] }, { type: "produce", topic: "orders", keys: ["erin", "frank"] }],
      progress: (ctx, start) => {
        const t = ctx.cluster.topic("orders");
        return { done: (t.logStart[0] > 0 ? 1 : 0) + (ctx.stats.produced - start.produced >= 2 ? 1 : 0), total: 2 };
      },
      success: msg("7-2.room.success"),
    },
    {
      kind: "predict",
      build: (ctx) => {
        const end = ctx.cluster.topic("orders").partitions[0].length;
        return { prompt: msg("7-2.next.q"), input: { type: "number" }, answer: end, explain: msg("7-2.next.why", { end }), reveal: (c) => c.produce("orders", "grace") };
      },
    },
    {
      kind: "predict",
      build: (ctx) => ({
        prompt: msg("7-2.audit.q"),
        input: choices(ctx.rng, "7-2.audit", ["reset", "crash", "old"]),
        answer: "reset",
        explain: msg("7-2.audit.why"),
        reveal: (c) => c.fetch("audit", "orders", 0),
      }),
    },
  ],
  check: q72,
};

// ---------------------------------------------------------------- 7-3 Latest only (compaction)

const q73: Question[] = [
  { concept: "compaction", build: (r) => ({ prompt: msg("7-3.check.keeps.q"), input: choices(r, "7-3.check.keeps", ["latest", "first", "all"]), answer: "latest", explain: msg("7-3.check.keeps.why") }) },
  { concept: "compaction", build: (r) => ({ prompt: msg("7-3.check.tomb.q"), input: choices(r, "7-3.check.tomb", ["null", "delete", "header"]), answer: "null", explain: msg("7-3.check.tomb.why") }) },
  { concept: "compaction", build: (r) => ({ prompt: msg("7-3.check.active.q"), input: choices(r, "7-3.check.active", ["never", "first", "always"]), answer: "never", explain: msg("7-3.check.active.why") }) },
  { concept: "compaction", build: (r) => ({ prompt: msg("7-3.check.offsets.q"), input: choices(r, "7-3.check.offsets", ["gaps", "renumber", "reset"]), answer: "gaps", explain: msg("7-3.check.offsets.why") }) },
];

const level73: Level = {
  id: "7-3",
  world: 7,
  title: msg("7-3.title"),
  summary: msg("7-3.summary"),
  topics: [{ name: "profiles", partitions: 1 }],
  slots: 13,
  storage: { topic: "profiles", options: { segmentSize: 3, policy: "compact" } },
  steps: [
    {
      kind: "brief",
      title: msg("7-3.brief.title"),
      body: msg("7-3.brief.body"),
      mapping: [
        { icon: "note", thing: msg("7-3.map.book"), kafka: msg("7-3.map.topic") },
        { icon: "file", thing: msg("7-3.map.cross"), kafka: msg("7-3.map.compaction") },
        { icon: "tag", thing: msg("7-3.map.stamp"), kafka: msg("7-3.map.tombstone") },
      ],
      breaks: msg("7-3.brief.breaks"),
    },
    {
      kind: "watch",
      title: msg("7-3.updates.title"),
      body: msg("7-3.updates.body"),
      table: true,
      script: async (ctx) => {
        for (const [k, v] of [["alice", "#1"], ["bob", "#1"], ["alice", "#2"], ["carol", "#1"], ["alice", "#3"], ["bob", "#2"], ["dave", "#1"]]) {
          await ctx.produce("profiles", k, v);
          await ctx.wait(80);
        }
      },
    },
    {
      kind: "predict",
      build: (ctx) => ({
        prompt: msg("7-3.survive.q"),
        input: choices(ctx.rng, "7-3.survive", ["three", "one", "all"]),
        answer: "three",
        explain: msg("7-3.survive.why"),
        reveal: async (c) => {
          c.log!.clean();
          await c.wait(900);
        },
      }),
    },
    {
      kind: "predict",
      build: (ctx) => ({ prompt: msg("7-3.offsets.q"), input: choices(ctx.rng, "7-3.offsets", ["gaps", "renumber"]), answer: "gaps", explain: msg("7-3.offsets.why") }),
    },
    {
      kind: "task",
      title: msg("7-3.forget.title"),
      body: msg("7-3.forget.body"),
      table: true,
      tools: [{ type: "tombstone", topic: "profiles", keys: ["carol"] }, { type: "produce", topic: "profiles", keys: ["alice", "bob"], sequence: true }, { type: "clean" }],
      progress: (ctx) => {
        const t = ctx.cluster.topic("profiles");
        const tomb = t.partitions[0].some((r) => r.key === "carol" && r.headers["x-tombstone"] === "1") ? 1 : 0;
        const gone = t.partitions[0].filter((r) => r.key === "carol" && r.headers["x-tombstone"] !== "1").every((r) => t.isGone(0, r.offset)) ? 1 : 0;
        return { done: tomb + (tomb ? gone : 0), total: 2 };
      },
      success: msg("7-3.forget.success"),
    },
  ],
  check: q73,
};

// ---------------------------------------------------------------- 7-4 Cold storage (tiered)

const q74: Question[] = [
  { concept: "tiered", build: (r) => ({ prompt: msg("7-4.check.what.q"), input: choices(r, "7-4.check.what", ["offload", "delete", "compress"]), answer: "offload", explain: msg("7-4.check.what.why") }) },
  { concept: "tiered", build: (r) => ({ prompt: msg("7-4.check.serve.q"), input: choices(r, "7-4.check.serve", ["broker", "s3", "never"]), answer: "broker", explain: msg("7-4.check.serve.why") }) },
  { concept: "tiered", build: (r) => ({ prompt: msg("7-4.check.which.q"), input: choices(r, "7-4.check.which", ["closed", "active", "all"]), answer: "closed", explain: msg("7-4.check.which.why") }) },
  { concept: "tiered", build: (r) => ({ prompt: msg("7-4.check.compact.q"), input: choices(r, "7-4.check.compact", ["no", "yes"]), answer: "no", explain: msg("7-4.check.compact.why") }) },
];

const level74: Level = {
  id: "7-4",
  world: 7,
  title: msg("7-4.title"),
  summary: msg("7-4.summary"),
  topics: [{ name: "orders", partitions: 1 }],
  slots: 13,
  consumers: [ARCHIVE],
  storage: { topic: "orders", options: { segmentSize: 3, policy: "delete", localSegments: 1 } },
  steps: [
    {
      kind: "brief",
      title: msg("7-4.brief.title"),
      body: msg("7-4.brief.body"),
      mapping: [
        { icon: "factory", thing: msg("7-4.map.cold"), kafka: msg("7-4.map.remote") },
        { icon: "rows", thing: msg("7-4.map.shelf"), kafka: msg("7-4.map.local") },
      ],
      code: "# broker\nremote.log.storage.system.enable=true\n# topic\nremote.storage.enable=true\nlocal.retention.ms=86400000    # keep 1 day on local disk\nretention.ms=31536000000       # keep 1 year in total",
    },
    {
      kind: "watch",
      title: msg("7-4.offload.title"),
      body: msg("7-4.offload.body"),
      script: async (ctx) => {
        for (let i = 0; i < 10; i++) {
          await ctx.produce("orders", ["alice", "bob", "carol", "dave", "erin"][i % 5]);
          await ctx.wait(80);
        }
      },
    },
    {
      kind: "predict",
      build: (ctx) => ({ prompt: msg("7-4.read.q"), input: choices(ctx.rng, "7-4.read", ["broker", "gone", "s3"]), answer: "broker", explain: msg("7-4.read.why") }),
    },
    {
      kind: "task",
      title: msg("7-4.archive.title"),
      body: msg("7-4.archive.body"),
      tools: [{ type: "fetch", topic: "orders", partition: 0, groups: ["archive"] }],
      progress: (ctx) => ({ done: Math.min(4, ctx.cluster.position("archive", "orders", 0)), total: 4 }),
      success: msg("7-4.archive.success"),
    },
    {
      kind: "predict",
      build: (ctx) => ({ prompt: msg("7-4.compact.q"), input: choices(ctx.rng, "7-4.compact", ["no", "yes"]), answer: "no", explain: msg("7-4.compact.why") }),
    },
  ],
  check: q74,
};

export const WORLD7: Level[] = [level71, level72, level73, level74];
