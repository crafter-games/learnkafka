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

describe("Cluster partitions", () => {
  it("adds partitions; keys may remap, old records stay put", () => {
    const c = new Cluster([{ name: "t", partitions: 3 }]);
    const before = ["alice", "bob", "carol", "dave", "erin", "frank"].map((k) => c.produce("t", k, "v").partition);
    c.addPartitions("t", 1);
    expect(c.topic("t").numPartitions).toBe(4);
    const after = ["alice", "bob", "carol", "dave", "erin", "frank"].map((k) => c.topic("t").partitionFor(k));
    expect(after.some((p, i) => p !== before[i])).toBe(true);
    expect(c.topic("t").endOffsets().reduce((a, b) => a + b, 0)).toBe(6);
  });

  it("explicit partitions override the partitioner", () => {
    const c = new Cluster([{ name: "t", partitions: 3 }]);
    expect(c.produce("t", "alice", "v", {}, 2).partition).toBe(2);
  });

  it("peeks the sticky partition for keyless records", () => {
    const c = new Cluster([{ name: "t", partitions: 3 }]);
    for (let i = 0; i < 4; i++) c.produce("t", null, "v");
    expect(c.topic("t").peekNullPartition()).toBe(1);
    expect(c.produce("t", null, "v").partition).toBe(1);
  });

  it("total lag sums partitions", () => {
    const c = new Cluster([{ name: "t", partitions: 2 }]);
    c.produce("t", null, "a", {}, 0);
    c.produce("t", null, "b", {}, 1);
    c.fetch("g", "t", 0);
    expect(c.totalLag("g", "t")).toBe(1);
  });
});
