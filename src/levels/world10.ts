// World 10 — Schemas & Security. Facts: docs/research/kafka-curriculum.md (World 10 — Ecosystem) and
// src/sim/governance.ts: Schema Registry is a separate (Confluent) service, records carry a magic
// byte + 4-byte schema id, BACKWARD is the default compatibility (new schema reads old data, so add
// fields only with defaults and upgrade consumers first); listeners are PLAINTEXT unless configured,
// SSL encrypts, SASL authenticates, SASL_SSL does both; ACLs deny by default and a group consumer
// needs READ on the topic and on the group.
import { choices, msg, randInt, type Level, type Question } from "./types";

const ORDER_FIELDS = [
  { name: "id", required: true },
  { name: "item", required: true },
  { name: "amount", required: true },
  { name: "note", required: false },
];

// ---------------------------------------------------------------- 10-1 One shared language (Schema Registry)

const q101: Question[] = [
  { concept: "schemas", build: (r) => ({ prompt: msg("10-1.check.carry.q"), input: choices(r, "10-1.check.carry", ["id", "schema", "nothing"]), answer: "id", explain: msg("10-1.check.carry.why") }) },
  { concept: "schemas", build: (r) => ({ prompt: msg("10-1.check.part.q"), input: choices(r, "10-1.check.part", ["separate", "broker", "client"]), answer: "separate", explain: msg("10-1.check.part.why") }) },
  { concept: "schemas", build: (r) => ({ prompt: msg("10-1.check.bad.q"), input: choices(r, "10-1.check.bad", ["producer", "broker", "consumer"]), answer: "producer", explain: msg("10-1.check.bad.why") }) },
  {
    concept: "schemas",
    build: (r) => {
      const n = randInt(r, 3, 9);
      return { prompt: msg("10-1.check.bytes.q", { n }), input: { type: "number" }, answer: 5 * n, explain: msg("10-1.check.bytes.why", { n, total: 5 * n }) };
    },
  },
];

const level101: Level = {
  id: "10-1",
  world: 10,
  title: msg("10-1.title"),
  summary: msg("10-1.summary"),
  topics: [{ name: "orders", partitions: 1 }],
  slots: 10,
  governance: { schema: { subject: "orders-value", fields: ORDER_FIELDS } },
  steps: [
    {
      kind: "brief",
      title: msg("10-1.brief.title"),
      body: msg("10-1.brief.body"),
      mapping: [
        { icon: "file", thing: msg("10-1.map.form"), kafka: msg("10-1.map.schema") },
        { icon: "hash", thing: msg("10-1.map.number"), kafka: msg("10-1.map.id") },
      ],
      breaks: msg("10-1.brief.breaks"),
      code: 'props.put("value.serializer", KafkaAvroSerializer.class);\nprops.put("schema.registry.url", "http://registry:8081");\n// subject "orders-value" ← schema registered on first send',
    },
    {
      kind: "predict",
      build: (ctx) => ({ prompt: msg("10-1.carry.q"), input: choices(ctx.rng, "10-1.carry", ["id", "schema", "nothing"]), answer: "id", explain: msg("10-1.carry.why") }),
    },
    {
      kind: "task",
      title: msg("10-1.send.title"),
      body: msg("10-1.send.body"),
      streams: "schema",
      tools: [{ type: "actions", ids: ["sendValid", "sendInvalid"] }],
      progress: (ctx) => ({ done: Math.min(1, Math.floor(ctx.schemas!.sent / 3)) + (ctx.schemas!.refused > 0 ? 1 : 0), total: 2 }),
      success: msg("10-1.send.success"),
    },
    {
      kind: "predict",
      build: (ctx) => ({ prompt: msg("10-1.where.q"), input: choices(ctx.rng, "10-1.where", ["producer", "broker", "consumer"]), answer: "producer", explain: msg("10-1.where.why") }),
    },
  ],
  check: q101,
};

// ---------------------------------------------------------------- 10-2 Changing the form (schema evolution)

const q102: Question[] = [
  { concept: "evolution", build: (r) => ({ prompt: msg("10-2.check.default.q"), input: choices(r, "10-2.check.default", ["backward", "forward", "none"]), answer: "backward", explain: msg("10-2.check.default.why") }) },
  { concept: "evolution", build: (r) => ({ prompt: msg("10-2.check.add.q"), input: choices(r, "10-2.check.add", ["default", "required", "rename"]), answer: "default", explain: msg("10-2.check.add.why") }) },
  { concept: "evolution", build: (r) => ({ prompt: msg("10-2.check.first.q"), input: choices(r, "10-2.check.first", ["consumers", "producers", "same"]), answer: "consumers", explain: msg("10-2.check.first.why") }) },
  { concept: "evolution", build: (r) => ({ prompt: msg("10-2.check.forward.q"), input: choices(r, "10-2.check.forward", ["old", "new", "both"]), answer: "old", explain: msg("10-2.check.forward.why") }) },
];

const level102: Level = {
  id: "10-2",
  world: 10,
  title: msg("10-2.title"),
  summary: msg("10-2.summary"),
  topics: [{ name: "orders", partitions: 1 }],
  slots: 10,
  governance: { schema: { subject: "orders-value", fields: ORDER_FIELDS } },
  steps: [
    {
      kind: "brief",
      title: msg("10-2.brief.title"),
      body: msg("10-2.brief.body"),
      mapping: [
        { icon: "file", thing: msg("10-2.map.reprint"), kafka: msg("10-2.map.version") },
        { icon: "sign", thing: msg("10-2.map.rule"), kafka: msg("10-2.map.compat") },
      ],
    },
    {
      kind: "predict",
      build: (ctx) => ({ prompt: msg("10-2.required.q"), input: choices(ctx.rng, "10-2.required", ["rejected", "accepted", "breaks"]), answer: "rejected", explain: msg("10-2.required.why") }),
    },
    {
      kind: "task",
      title: msg("10-2.evolve.title"),
      body: msg("10-2.evolve.body"),
      streams: "schema",
      tools: [
        { type: "setting", field: "compatibility", options: ["BACKWARD", "FORWARD", "FULL", "NONE"] },
        { type: "actions", ids: ["addOptional", "removeField", "addRequired"] },
      ],
      progress: (ctx) => {
        const sc = ctx.schemas!;
        const accepted = sc.history.filter((h) => h.ok && h.change !== "addRequired").length;
        const rejected = sc.history.some((h) => !h.ok);
        return { done: Math.min(2, accepted) + (rejected ? 1 : 0), total: 3 };
      },
      success: msg("10-2.evolve.success"),
    },
    {
      kind: "predict",
      build: (ctx) => ({ prompt: msg("10-2.order.q"), input: choices(ctx.rng, "10-2.order", ["consumers", "producers", "same"]), answer: "consumers", explain: msg("10-2.order.why") }),
    },
  ],
  check: q102,
};

// ---------------------------------------------------------------- 10-3 Locks on the doors (TLS + SASL)

const q103: Question[] = [
  { concept: "security", build: (r) => ({ prompt: msg("10-3.check.default.q"), input: choices(r, "10-3.check.default", ["plaintext", "ssl", "sasl"]), answer: "plaintext", explain: msg("10-3.check.default.why") }) },
  { concept: "security", build: (r) => ({ prompt: msg("10-3.check.ssl.q"), input: choices(r, "10-3.check.ssl", ["encrypts", "authenticates", "authorizes"]), answer: "encrypts", explain: msg("10-3.check.ssl.why") }) },
  { concept: "security", build: (r) => ({ prompt: msg("10-3.check.both.q"), input: choices(r, "10-3.check.both", ["sasl_ssl", "ssl", "sasl_plaintext"]), answer: "sasl_ssl", explain: msg("10-3.check.both.why") }) },
  { concept: "security", build: (r) => ({ prompt: msg("10-3.check.mech.q"), input: choices(r, "10-3.check.mech", ["scram", "acl", "isr"]), answer: "scram", explain: msg("10-3.check.mech.why") }) },
];

const level103: Level = {
  id: "10-3",
  world: 10,
  title: msg("10-3.title"),
  summary: msg("10-3.summary"),
  topics: [{ name: "orders", partitions: 1 }],
  slots: 10,
  governance: { security: true },
  steps: [
    {
      kind: "brief",
      title: msg("10-3.brief.title"),
      body: msg("10-3.brief.body"),
      mapping: [
        { icon: "package", thing: msg("10-3.map.van"), kafka: msg("10-3.map.tls") },
        { icon: "tag", thing: msg("10-3.map.badge"), kafka: msg("10-3.map.sasl") },
      ],
    },
    {
      kind: "watch",
      title: msg("10-3.open.title"),
      body: msg("10-3.open.body"),
      streams: "security",
      script: (ctx) => ctx.wait(5200),
    },
    {
      kind: "predict",
      build: (ctx) => ({ prompt: msg("10-3.sslOnly.q"), input: choices(ctx.rng, "10-3.sslOnly", ["no", "yes", "half"]), answer: "no", explain: msg("10-3.sslOnly.why") }),
    },
    {
      kind: "task",
      title: msg("10-3.lock.title"),
      body: msg("10-3.lock.body"),
      streams: "security",
      tools: [{ type: "setting", field: "listener", options: ["PLAINTEXT", "SSL", "SASL_PLAINTEXT", "SASL_SSL"] }],
      progress: (ctx) => {
        const p = ctx.security!.protocol;
        return { done: (p === "SSL" || p === "SASL_SSL" ? 1 : 0) + (p === "SASL_PLAINTEXT" || p === "SASL_SSL" ? 1 : 0), total: 2 };
      },
      success: msg("10-3.lock.success"),
    },
  ],
  check: q103,
};

// ---------------------------------------------------------------- 10-4 Who can do what (ACLs)

const q104: Question[] = [
  { concept: "acls", build: (r) => ({ prompt: msg("10-4.check.default.q"), input: choices(r, "10-4.check.default", ["deny", "allow", "read"]), answer: "deny", explain: msg("10-4.check.default.why") }) },
  { concept: "acls", build: (r) => ({ prompt: msg("10-4.check.group.q"), input: choices(r, "10-4.check.group", ["both", "topic", "group"]), answer: "both", explain: msg("10-4.check.group.why") }) },
  { concept: "acls", build: (r) => ({ prompt: msg("10-4.check.least.q"), input: choices(r, "10-4.check.least", ["least", "all", "admin"]), answer: "least", explain: msg("10-4.check.least.why") }) },
  { concept: "acls", build: (r) => ({ prompt: msg("10-4.check.authn.q"), input: choices(r, "10-4.check.authn", ["authn", "acl", "tls"]), answer: "authn", explain: msg("10-4.check.authn.why") }) },
];

const level104: Level = {
  id: "10-4",
  world: 10,
  title: msg("10-4.title"),
  summary: msg("10-4.summary"),
  topics: [
    { name: "orders", partitions: 1 },
    { name: "invoices", partitions: 1 },
  ],
  slots: 10,
  consumers: [{ group: "analytics", label: "analytics", color: "#2fb5a3" }],
  governance: { acl: true },
  steps: [
    {
      kind: "brief",
      title: msg("10-4.brief.title"),
      body: msg("10-4.brief.body"),
      mapping: [
        { icon: "tag", thing: msg("10-4.map.badge"), kafka: msg("10-4.map.principal") },
        { icon: "note", thing: msg("10-4.map.list"), kafka: msg("10-4.map.acl") },
      ],
      code: "kafka-acls.sh --bootstrap-server broker:9092 --add \\\n  --allow-principal User:analytics \\\n  --operation Read --topic orders --group analytics",
    },
    {
      kind: "watch",
      title: msg("10-4.denied.title"),
      body: msg("10-4.denied.body"),
      streams: "acl",
      script: (ctx) => ctx.wait(4000),
    },
    {
      kind: "predict",
      build: (ctx) => ({ prompt: msg("10-4.need.q"), input: choices(ctx.rng, "10-4.need", ["both", "topic", "group"]), answer: "both", explain: msg("10-4.need.why") }),
    },
    {
      kind: "task",
      title: msg("10-4.grant.title"),
      body: msg("10-4.grant.body"),
      streams: "acl",
      tools: [{ type: "actions", ids: ["aclReadOrders", "aclReadGroup", "aclWriteInvoices", "aclWriteOrders"] }],
      progress: (ctx) => {
        const a = ctx.auth!;
        const last = (p: string, op: string, r: string) => [...a.log].reverse().find((e) => e.principal === p && e.operation === op && e.resource === r);
        const reads = last("analytics", "Read", "topic:orders")?.allowed ? 1 : 0;
        const writes = last("billing", "Write", "topic:invoices")?.allowed ? 1 : 0;
        const tight = reads && writes && !a.allows("analytics", "Write", "topic:orders") ? 1 : 0;
        return { done: reads + writes + tight, total: 3 };
      },
      success: msg("10-4.grant.success"),
    },
  ],
  check: q104,
};

export const WORLD10: Level[] = [level101, level102, level103, level104];
