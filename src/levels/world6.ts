// World 6 — Delivery guarantees & transactions. Facts: docs/research/kafka-curriculum.md
// (Delivery semantics): at-most / at-least / exactly-once, transactional.id + epochs (fencing),
// commit/abort markers, read_committed vs read_uncommitted (default), LSO,
// sendOffsetsToTransaction for read-process-write. 6-1 is an interleaved "diagnose the symptom" review.
import { COLORS } from "@/stage/theme";
import { choices, msg, type Level, type LevelCtx, type Question } from "./types";

const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

// ---------------------------------------------------------------- 6-1 Diagnose the symptom

const diagnose = (id: string, options: string[], answer: string) => ({
  kind: "predict" as const,
  build: (ctx: LevelCtx) => ({ prompt: msg(`6-1.${id}.q`), input: choices(ctx.rng, `6-1.${id}`, options), answer, explain: msg(`6-1.${id}.why`) }),
});

const q61: Question[] = [
  { concept: "semantics", build: (r) => ({ prompt: msg("6-1.check.atmost.q"), input: choices(r, "6-1.check.atmost", ["loss", "dups", "neither"]), answer: "loss", explain: msg("6-1.check.atmost.why") }) },
  { concept: "semantics", build: (r) => ({ prompt: msg("6-1.check.atleast.q"), input: choices(r, "6-1.check.atleast", ["dups", "loss", "neither"]), answer: "dups", explain: msg("6-1.check.atleast.why") }) },
  { concept: "semantics", build: (r) => ({ prompt: msg("6-1.check.default.q"), input: choices(r, "6-1.check.default", ["atleast", "atmost", "exactly"]), answer: "atleast", explain: msg("6-1.check.default.why") }) },
  { concept: "semantics", build: (r) => ({ prompt: msg("6-1.check.idem.q"), input: choices(r, "6-1.check.idem", ["process", "store", "nothing"]), answer: "process", explain: msg("6-1.check.idem.why") }) },
];

const level61: Level = {
  id: "6-1",
  world: 6,
  title: msg("6-1.title"),
  summary: msg("6-1.summary"),
  topics: [{ name: "orders", partitions: 2 }],
  slots: 8,
  steps: [
    {
      kind: "brief",
      title: msg("6-1.brief.title"),
      body: msg("6-1.brief.body"),
      mapping: [
        { icon: "note", thing: msg("6-1.map.atmost"), kafka: msg("6-1.map.atmostK") },
        { icon: "rows", thing: msg("6-1.map.atleast"), kafka: msg("6-1.map.atleastK") },
        { icon: "hash", thing: msg("6-1.map.exactly"), kafka: msg("6-1.map.exactlyK") },
      ],
      breaks: msg("6-1.brief.breaks"),
    },
    diagnose("s1", ["retry", "commitBefore", "acks1"], "retry"),
    diagnose("s2", ["acks1", "retry", "rebalance"], "acks1"),
    diagnose("s3", ["commitBefore", "autoCommit", "idempotence"], "commitBefore"),
    diagnose("s4", ["autoCommit", "acks1", "compaction"], "autoCommit"),
    diagnose("s5", ["sideEffect", "retry", "lag"], "sideEffect"),
  ],
  check: q61,
};

// ---------------------------------------------------------------- 6-2 All or nothing (transactions)

const READERS = [
  { group: "billing", label: "Billing", color: hex(COLORS.consumer), isolation: "read_committed" as const, topic: "orders" },
  { group: "audit", label: "Audit", color: "#8b5cf6", isolation: "read_uncommitted" as const, topic: "orders" },
];

const q62: Question[] = [
  { concept: "transactions", build: (r) => ({ prompt: msg("6-2.check.atomic.q"), input: choices(r, "6-2.check.atomic", ["all", "some", "order"]), answer: "all", explain: msg("6-2.check.atomic.why") }) },
  { concept: "transactions", build: (r) => ({ prompt: msg("6-2.check.default.q"), input: choices(r, "6-2.check.default", ["uncommitted", "committed"]), answer: "uncommitted", explain: msg("6-2.check.default.why") }) },
  { concept: "transactions", build: (r) => ({ prompt: msg("6-2.check.lso.q"), input: choices(r, "6-2.check.lso", ["open", "end", "hw"]), answer: "open", explain: msg("6-2.check.lso.why") }) },
  { concept: "transactions", build: (r) => ({ prompt: msg("6-2.check.markers.q"), input: choices(r, "6-2.check.markers", ["markers", "deleted", "zk"]), answer: "markers", explain: msg("6-2.check.markers.why") }) },
];

const level62: Level = {
  id: "6-2",
  world: 6,
  title: msg("6-2.title"),
  summary: msg("6-2.summary"),
  topics: [
    { name: "orders", partitions: 1 },
    { name: "invoices", partitions: 1 },
  ],
  slots: 8,
  txn: { readers: READERS },
  steps: [
    {
      kind: "brief",
      title: msg("6-2.brief.title"),
      body: msg("6-2.brief.body"),
      mapping: [
        { icon: "package", thing: msg("6-2.map.pending"), kafka: msg("6-2.map.pendingK") },
        { icon: "flag", thing: msg("6-2.map.plate"), kafka: msg("6-2.map.marker") },
        { icon: "robot", thing: msg("6-2.map.readers"), kafka: msg("6-2.map.isolation") },
      ],
    },
    {
      kind: "task",
      title: msg("6-2.abort.title"),
      body: msg("6-2.abort.body"),
      seen: true,
      tools: [{ type: "txn" }],
      progress: (ctx) => {
        const audit = ctx.readers![1].seen.some((x) => x.aborted) ? 1 : 0;
        const aborted = ctx.txn!.aborted.size > 0 ? 1 : 0;
        return { done: aborted + audit, total: 2 };
      },
      success: msg("6-2.abort.success"),
    },
    {
      kind: "predict",
      build: (ctx) => ({ prompt: msg("6-2.stuck.q"), input: choices(ctx.rng, "6-2.stuck", ["waits", "skips", "reads"]), answer: "waits", explain: msg("6-2.stuck.why") }),
    },
    {
      kind: "task",
      title: msg("6-2.commit.title"),
      body: msg("6-2.commit.body"),
      seen: true,
      tools: [{ type: "txn" }],
      progress: (ctx) => {
        const billing = ctx.readers![0].seen.filter((x) => !x.aborted).length;
        return { done: Math.min(2, billing), total: 2 };
      },
      success: msg("6-2.commit.success"),
    },
  ],
  check: q62,
};

// ---------------------------------------------------------------- 6-3 Exactly once & zombies

const q63: Question[] = [
  { concept: "eos", build: (r) => ({ prompt: msg("6-3.check.recipe.q"), input: choices(r, "6-3.check.recipe", ["txn", "acks", "retries"]), answer: "txn", explain: msg("6-3.check.recipe.why") }) },
  { concept: "eos", build: (r) => ({ prompt: msg("6-3.check.offsets.q"), input: choices(r, "6-3.check.offsets", ["inside", "after", "before"]), answer: "inside", explain: msg("6-3.check.offsets.why") }) },
  { concept: "eos", build: (r) => ({ prompt: msg("6-3.check.zombie.q"), input: choices(r, "6-3.check.zombie", ["epoch", "timeout", "nothing"]), answer: "epoch", explain: msg("6-3.check.zombie.why") }) },
  { concept: "eos", build: (r) => ({ prompt: msg("6-3.check.limits.q"), input: choices(r, "6-3.check.limits", ["external", "kafka", "never"]), answer: "external", explain: msg("6-3.check.limits.why") }) },
];

const level63: Level = {
  id: "6-3",
  world: 6,
  title: msg("6-3.title"),
  summary: msg("6-3.summary"),
  topics: [
    { name: "orders", partitions: 1 },
    { name: "invoices", partitions: 1 },
  ],
  slots: 8,
  txn: { readers: [{ ...READERS[0], topic: "invoices" }] },
  steps: [
    {
      kind: "brief",
      title: msg("6-3.brief.title"),
      body: msg("6-3.brief.body"),
      code: "producer.beginTransaction();\nfor (record : consumer.poll()) {\n  producer.send(toInvoice(record));\n}\nproducer.sendOffsetsToTransaction(offsets, consumer.groupMetadata());\nproducer.commitTransaction();",
    },
    {
      kind: "watch",
      title: msg("6-3.crash.title"),
      body: msg("6-3.crash.body"),
      seen: true,
      script: async (ctx) => {
        // A processor turns order #1 into invoice #1, then crashes before committing
        const t = ctx.txn!;
        t.begin();
        t.send("invoices", "alice", "inv#1");
        await ctx.wait(1600);
        t.restartInstance(); // the replacement instance fences the old one and aborts its open txn
        await ctx.wait(1400);
        // …and redoes the work in a fresh transaction
        t.begin();
        t.send("invoices", "alice", "inv#1");
        await ctx.wait(900);
        t.finish(true);
        await ctx.wait(2200);
      },
    },
    {
      kind: "predict",
      build: () => ({ prompt: msg("6-3.count.q"), input: { type: "number" }, answer: 1, explain: msg("6-3.count.why") }),
    },
    {
      kind: "predict",
      build: (ctx) => ({ prompt: msg("6-3.zombie.q"), input: choices(ctx.rng, "6-3.zombie", ["fenced", "duplicate", "both"]), answer: "fenced", explain: msg("6-3.zombie.why") }),
    },
    {
      kind: "predict",
      build: (ctx) => ({ prompt: msg("6-3.email.q"), input: choices(ctx.rng, "6-3.email", ["maybe", "never", "always"]), answer: "maybe", explain: msg("6-3.email.why") }),
    },
  ],
  check: q63,
};

export const WORLD6: Level[] = [level61, level62, level63];
