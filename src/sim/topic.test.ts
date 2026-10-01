import { describe, expect, it } from "vitest";
import { STICKY_BATCH_RECORDS, Topic } from "./topic";
import type { SimEvent } from "./events";

describe("Topic", () => {
  it("assigns offsets per partition, starting at 0", () => {
    const t = new Topic("orders", 3);
    const a = t.produce("alice", "o1");
    const b = t.produce("alice", "o2");
    expect([a.offset, b.offset]).toEqual([0, 1]);
    expect(a.partition).toBe(b.partition);
    expect(t.endOffsets().reduce((s, n) => s + n, 0)).toBe(2);
  });

  it("keeps per-key order inside one partition", () => {
    const t = new Topic("orders", 3);
    for (let i = 0; i < 5; i++) t.produce("bob", `o${i}`);
    const p = t.partitions.find((log) => log.length > 0)!;
    expect(p.map((r) => r.value)).toEqual(["o0", "o1", "o2", "o3", "o4"]);
  });

  it("sticks null-key records to one partition per batch", () => {
    const t = new Topic("orders", 3);
    const parts = Array.from({ length: STICKY_BATCH_RECORDS + 1 }, () => t.produce(null, "x").partition);
    expect(new Set(parts.slice(0, STICKY_BATCH_RECORDS)).size).toBe(1);
    expect(parts[STICKY_BATCH_RECORDS]).not.toBe(parts[0]);
  });

  it("emits produced then appended", () => {
    const t = new Topic("orders", 2);
    const seen: SimEvent["type"][] = [];
    t.events.on((e) => seen.push(e.type));
    t.produce("k", "v");
    expect(seen).toEqual(["produced", "appended"]);
  });
});
