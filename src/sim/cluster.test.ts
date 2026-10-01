import { describe, expect, it } from "vitest";
import { Cluster } from "./cluster";

describe("Cluster", () => {
  it("routes records to the named topic with independent offsets", () => {
    const c = new Cluster([
      { name: "orders", partitions: 1 },
      { name: "payments", partitions: 1 },
    ]);
    c.produce("orders", "a", "o1");
    const p = c.produce("payments", "a", "p1");
    expect(p.offset).toBe(0);
    expect(p.topic).toBe("payments");
  });

  it("reading does not delete: two groups read the same records", () => {
    const c = new Cluster([{ name: "orders", partitions: 1 }]);
    for (let i = 0; i < 3; i++) c.produce("orders", "k", `o${i}`);
    expect(c.fetch("A", "orders", 0)?.value).toBe("o0");
    expect(c.fetch("A", "orders", 0)?.value).toBe("o1");
    expect(c.fetch("B", "orders", 0)?.value).toBe("o0");
    expect(c.topic("orders").partitions[0]).toHaveLength(3);
    expect(c.position("A", "orders", 0)).toBe(2);
    expect(c.lag("B", "orders", 0)).toBe(2);
  });

  it("returns null when a group is caught up", () => {
    const c = new Cluster([{ name: "orders", partitions: 1 }]);
    expect(c.fetch("A", "orders", 0)).toBeNull();
  });

  it("keeps headers on the record", () => {
    const c = new Cluster([{ name: "orders", partitions: 1 }]);
    expect(c.produce("orders", null, "v", { source: "web" }).headers).toEqual({ source: "web" });
  });
});
