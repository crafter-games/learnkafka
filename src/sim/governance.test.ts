import { describe, expect, it } from "vitest";
import { Authorizer, listener, SchemaRegistry, sniff } from "./governance";

const BASE = [
  { name: "id", required: true },
  { name: "item", required: true },
  { name: "note", required: false },
];

describe("SchemaRegistry", () => {
  it("BACKWARD (default): optional adds and deletes pass, a new required field is rejected", () => {
    const r = new SchemaRegistry();
    expect(r.compatibility).toBe("BACKWARD");
    const v1 = r.register("orders-value", BASE);
    expect(v1.ok && v1.schema.version).toBe(1);
    expect(r.register("orders-value", [...BASE, { name: "coupon", required: false }]).ok).toBe(true);
    expect(r.register("orders-value", [...BASE, { name: "coupon", required: false }, { name: "phone", required: true }])).toEqual({ ok: false, reason: "addRequired" });
    expect(r.register("orders-value", BASE.filter((f) => f.name !== "item")).ok).toBe(true);
    expect(r.subjects.get("orders-value")).toHaveLength(3);
  });

  it("FORWARD rejects removing a required field but allows adding one", () => {
    const r = new SchemaRegistry();
    r.compatibility = "FORWARD";
    r.register("s", BASE);
    expect(r.register("s", BASE.filter((f) => f.name !== "item"))).toEqual({ ok: false, reason: "removeRequired" });
    expect(r.register("s", [...BASE, { name: "phone", required: true }]).ok).toBe(true);
  });

  it("validates records against the latest schema", () => {
    const r = new SchemaRegistry();
    r.register("s", BASE);
    expect(r.validate("s", ["id", "item"])).toBe(true);
    expect(r.validate("s", ["id"])).toBe(false);
    expect(r.validate("s", ["id", "item", "colour"])).toBe(false);
  });
});

describe("listeners", () => {
  it("only SSL listeners hide the payload; only SASL listeners authenticate", () => {
    expect(sniff("PLAINTEXT", "alice order #1")).toBe("alice order #1");
    expect(sniff("SASL_SSL", "alice order #1")).not.toContain("alice");
    expect(listener("SSL")).toEqual({ encrypted: true, authenticated: false });
    expect(listener("SASL_SSL")).toEqual({ encrypted: true, authenticated: true });
  });
});

describe("Authorizer", () => {
  it("denies by default and a group consumer needs READ on topic and group", () => {
    const a = new Authorizer();
    expect(a.produce("billing", "invoices")).toBe(false);
    a.grant({ principal: "billing", operation: "Write", resource: "topic:invoices" });
    expect(a.produce("billing", "invoices")).toBe(true);
    a.grant({ principal: "analytics", operation: "Read", resource: "topic:orders" });
    expect(a.consume("analytics", "orders", "analytics")).toBe(false);
    expect(a.log.at(-1)!.missing).toBe("Read group:analytics");
    a.grant({ principal: "analytics", operation: "Read", resource: "group:analytics" });
    expect(a.consume("analytics", "orders", "analytics")).toBe(true);
  });
});
