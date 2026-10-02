// World 10 — Schemas & Security. Facts: docs/research/kafka-curriculum.md (World 10 — Ecosystem):
// Schema Registry is a separate service (Confluent's, not part of Apache Kafka; alternatives exist),
// serializers register a schema per subject and prefix each record with a magic byte and a 4-byte
// schema id; compatibility modes BACKWARD (the default), FORWARD, FULL, NONE: BACKWARD = the new
// schema can read data written with the previous one (add fields only with defaults, deletes are
// fine) so consumers upgrade first; FORWARD = the old schema can read new data. Security: listeners
// are PLAINTEXT unless configured; SSL (TLS) encrypts in transit, SASL (PLAIN, SCRAM, GSSAPI,
// OAUTHBEARER) authenticates clients, SASL_SSL does both; authorization uses ACLs
// (StandardAuthorizer in KRaft), denied by default when no ACL matches, and a consumer in a group
// needs READ on the topic and READ on the group.

export type Field = { name: string; required: boolean };
export type Compatibility = "BACKWARD" | "FORWARD" | "FULL" | "NONE";
export type SchemaVersion = { id: number; version: number; fields: Field[] };
export type RegisterResult = { ok: true; schema: SchemaVersion } | { ok: false; reason: "addRequired" | "removeRequired" };

let nextId = 1;

export class SchemaRegistry {
  compatibility: Compatibility = "BACKWARD";
  readonly subjects = new Map<string, SchemaVersion[]>();
  last: (RegisterResult & { subject: string }) | null = null;

  latest(subject: string) {
    return this.subjects.get(subject)?.at(-1);
  }

  /** Register a schema; checked against the latest version under the subject's compatibility. */
  register(subject: string, fields: Field[]): RegisterResult {
    const prev = this.latest(subject);
    const versions = this.subjects.get(subject) ?? [];
    if (prev) {
      const same = JSON.stringify(prev.fields) === JSON.stringify(fields);
      if (same) return this.note(subject, { ok: true, schema: prev });
      const reason = this.incompatible(prev.fields, fields);
      if (reason) return this.note(subject, { ok: false, reason });
    }
    const schema = { id: nextId++, version: versions.length + 1, fields };
    this.subjects.set(subject, [...versions, schema]);
    return this.note(subject, { ok: true, schema });
  }

  private note(subject: string, r: RegisterResult): RegisterResult {
    this.last = { ...r, subject };
    return r;
  }

  private incompatible(old: Field[], next: Field[]): "addRequired" | "removeRequired" | null {
    const has = (list: Field[], n: string) => list.some((f) => f.name === n);
    const backward = this.compatibility === "BACKWARD" || this.compatibility === "FULL";
    const forward = this.compatibility === "FORWARD" || this.compatibility === "FULL";
    // BACKWARD: the new reader must fill fields that old data doesn't have → they need defaults
    if (backward && next.some((f) => f.required && !has(old, f.name))) return "addRequired";
    // FORWARD: the old reader must fill fields that new data dropped → those needed defaults
    if (forward && old.some((f) => f.required && !has(next, f.name))) return "removeRequired";
    return null;
  }

  /** Does a record (its field names) match the latest schema? Required fields must be present. */
  validate(subject: string, record: string[]): boolean {
    const s = this.latest(subject);
    if (!s) return false;
    return s.fields.every((f) => !f.required || record.includes(f.name)) && record.every((n) => s.fields.some((f) => f.name === n));
  }
}

// ---------------------------------------------------------------- listeners

export type Protocol = "PLAINTEXT" | "SSL" | "SASL_PLAINTEXT" | "SASL_SSL";

export const listener = (p: Protocol) => ({ encrypted: p === "SSL" || p === "SASL_SSL", authenticated: p === "SASL_PLAINTEXT" || p === "SASL_SSL" });

/** What an eavesdropper on the network sees of a record. */
export function sniff(p: Protocol, plain: string): string {
  if (!listener(p).encrypted) return plain;
  let h = 0;
  for (const c of plain) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return Array.from({ length: Math.min(18, plain.length) }, (_, i) => "#%&@*$!?^~"[(h >> i) % 10]).join("");
}

// ---------------------------------------------------------------- ACLs

export type Operation = "Read" | "Write";
export type Acl = { principal: string; operation: Operation; resource: string };
export type Attempt = { principal: string; operation: Operation; resource: string; allowed: boolean; missing?: string };

export class Authorizer {
  readonly acls: Acl[] = [];
  readonly log: Attempt[] = [];

  grant(acl: Acl) {
    if (!this.has(acl)) this.acls.push(acl);
  }

  revoke(acl: Acl) {
    const i = this.acls.findIndex((a) => a.principal === acl.principal && a.operation === acl.operation && a.resource === acl.resource);
    if (i >= 0) this.acls.splice(i, 1);
  }

  has(acl: Acl) {
    return this.acls.some((a) => a.principal === acl.principal && a.operation === acl.operation && a.resource === acl.resource);
  }

  /** Default deny: allowed only if an ACL matches. */
  allows(principal: string, operation: Operation, resource: string) {
    return this.has({ principal, operation, resource });
  }

  /** Producing needs WRITE on the topic. */
  produce(principal: string, topic: string): boolean {
    const ok = this.allows(principal, "Write", `topic:${topic}`);
    this.record({ principal, operation: "Write", resource: `topic:${topic}`, allowed: ok, missing: ok ? undefined : `Write topic:${topic}` });
    return ok;
  }

  /** A consumer in a group needs READ on the topic and READ on the group. */
  consume(principal: string, topic: string, group: string): boolean {
    const topicOk = this.allows(principal, "Read", `topic:${topic}`);
    const groupOk = this.allows(principal, "Read", `group:${group}`);
    const ok = topicOk && groupOk;
    this.record({ principal, operation: "Read", resource: `topic:${topic}`, allowed: ok, missing: !topicOk ? `Read topic:${topic}` : !groupOk ? `Read group:${group}` : undefined });
    return ok;
  }

  private record(a: Attempt) {
    this.log.push(a);
    if (this.log.length > 30) this.log.shift();
  }
}
