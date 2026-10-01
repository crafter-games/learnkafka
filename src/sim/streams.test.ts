import { describe, expect, it } from "vitest";
import { Cluster } from "./cluster";
import { TOMBSTONE } from "./storage";
import { CountingApp, SourceConnector, streamView, tableView, WindowedCounter } from "./streams";

describe("KStream vs KTable", () => {
  it("the stream keeps every event; the table keeps the latest per key and tombstones delete", () => {
    const c = new Cluster([{ name: "prices", partitions: 1 }]);
    c.produce("prices", "apple", "1.00");
    c.produce("prices", "pear", "2.00");
    c.produce("prices", "apple", "1.20");
    c.produce("prices", "pear", "", { [TOMBSTONE]: "1" });
    expect(streamView(c, "prices")).toHaveLength(4);
    expect([...tableView(c, "prices")]).toEqual([["apple", "1.20"]]);
  });
});

describe("SourceConnector", () => {
  const rows = Array.from({ length: 7 }, (_, i) => ({ id: `row-${i + 1}`, value: `v${i + 1}` }));

  it("copies rows and flushes its position to the offsets topic every N rows", () => {
    const c = new Cluster([{ name: "customers", partitions: 1 }, { name: "connect-offsets", partitions: 1 }]);
    const s = new SourceConnector(c, "jdbc", "customers", "connect-offsets", 3, rows);
    for (let i = 0; i < 4; i++) s.tick();
    expect(c.topic("customers").partitions[0]).toHaveLength(4);
    expect(s.committed()).toBe(3);
  });

  it("a restarted task resumes from the flushed position and re-sends the unflushed rows", () => {
    const c = new Cluster([{ name: "customers", partitions: 1 }, { name: "connect-offsets", partitions: 1 }]);
    const s = new SourceConnector(c, "jdbc", "customers", "connect-offsets", 3, rows);
    for (let i = 0; i < 5; i++) s.tick();
    s.crash();
    s.tick();
    expect(s.position).toBe(5);
    s.restart();
    expect(s.position).toBe(3);
    for (let i = 0; i < 10; i++) s.tick();
    expect(s.duplicates).toBe(2);
    expect(s.pending).toBe(0);
  });
});

describe("CountingApp", () => {
  it("counts per key, writes the changelog, and restores the store from it after a crash", () => {
    const c = new Cluster([{ name: "clicks", partitions: 1 }, { name: "counts-changelog", partitions: 1 }]);
    const app = new CountingApp(c, "click-counter", "clicks", "counts-changelog");
    for (const k of ["alice", "bob", "alice", "alice"]) c.produce("clicks", k, "click");
    for (let i = 0; i < 4; i++) app.tick();
    expect(app.store.get("alice")).toBe(3);
    expect(c.topic("counts-changelog").partitions[0]).toHaveLength(4);
    app.crash();
    expect(app.store.size).toBe(0);
    app.restart();
    for (let i = 0; i < 5; i++) app.tick();
    expect(app.restoring).toBeNull();
    expect(app.store.get("alice")).toBe(3);
    expect(app.store.get("bob")).toBe(1);
    // Processing continues where the group left off
    c.produce("clicks", "bob", "click");
    app.tick();
    expect(app.store.get("bob")).toBe(2);
  });
});

describe("WindowedCounter", () => {
  it("drops records later than window end + grace", () => {
    const c = new Cluster([{ name: "clicks", partitions: 1 }]);
    const w = new WindowedCounter(c, "clicks", 10, 3);
    for (let i = 0; i < 4; i++) w.send("alice", 0); // t = 3, 6, 9, 12
    expect(w.send("alice", 5)).toBe(false); // t = 7, window [0,10) closed at 10 with grace 0
    w.grace = 10;
    expect(w.send("alice", 5)).toBe(true); // [0,10) open until 20
    expect(w.windows().map((x) => [x.start, x.count, x.closed])).toEqual([
      [0, 4, false],
      [10, 1, false],
    ]);
    expect(w.dropped).toBe(1);
  });
});
