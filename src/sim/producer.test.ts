import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cluster } from "./cluster";
import { BatchingProducer, RetryingProducer } from "./producer";
import { ReplicaSet } from "./replication";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("BatchingProducer", () => {
  it("sends one request when the batch fills", () => {
    const c = new Cluster([{ name: "t", partitions: 1 }]);
    const p = new BatchingProducer(c, { batchSize: 3, lingerMs: 1000, codec: "none" });
    p.send("t", "a", "1");
    p.send("t", "a", "2");
    expect(c.topic("t").partitions[0]).toHaveLength(0);
    p.send("t", "a", "3");
    expect(c.topic("t").partitions[0]).toHaveLength(3);
    expect(p.requests).toBe(1);
  });

  it("linger.ms sends a partial batch", () => {
    const c = new Cluster([{ name: "t", partitions: 1 }]);
    const p = new BatchingProducer(c, { batchSize: 10, lingerMs: 200, codec: "none" });
    p.send("t", "a", "1");
    vi.advanceTimersByTime(199);
    expect(p.requests).toBe(0);
    vi.advanceTimersByTime(1);
    expect(p.requests).toBe(1);
  });
});

describe("RetryingProducer", () => {
  it("duplicates on a lost ack without idempotence", () => {
    const c = new Cluster([{ name: "t", partitions: 1 }]);
    const p = new RetryingProducer(c, false, 1, () => 0);
    p.send("t", "k", "v");
    vi.advanceTimersByTime(1000);
    expect(c.topic("t").partitions[0]).toHaveLength(2);
    expect(p.duplicates).toBe(1);
  });

  it("drops the retry when idempotent", () => {
    const c = new Cluster([{ name: "t", partitions: 1 }]);
    const p = new RetryingProducer(c, true, 1, () => 0);
    p.send("t", "k", "v");
    vi.advanceTimersByTime(1000);
    expect(c.topic("t").partitions[0]).toHaveLength(1);
    expect(p.rejected).toBe(1);
  });
});

describe("ReplicaSet", () => {
  const mk = () => new Cluster(["b1", "b2", "b3"].map((name) => ({ name, partitions: 1 })));

  it("acks=1 can lose acknowledged records when the leader dies before followers copy", () => {
    const c = mk();
    const rs = new ReplicaSet(c, ["b1", "b2", "b3"], "1");
    rs.send("k", 1);
    expect(rs.receipts[0].status).toBe("acked");
    rs.crashLeader();
    expect(rs.lostAcked).toBe(1);
  });

  it("acks=all only acknowledges once every in-sync replica has the record", () => {
    const c = mk();
    const rs = new ReplicaSet(c, ["b1", "b2", "b3"], { acks: "all", copyMs: 100 });
    rs.start();
    rs.send("k", 1);
    expect(rs.receipts[0].status).toBe("pending");
    vi.advanceTimersByTime(100);
    expect(rs.receipts[0].status).toBe("acked");
    rs.crashLeader();
    expect(rs.receipts.filter((r) => r.status === "lost")).toHaveLength(0);
    rs.stop();
  });
});

describe("ReplicaSet (World 5)", () => {
  const mk = () => new Cluster(["b1", "b2", "b3"].map((name) => ({ name, partitions: 1 })));

  it("a slow follower drops out of the ISR and the high watermark stalls", () => {
    let t = 0;
    const c = mk();
    const rs = new ReplicaSet(c, ["b1", "b2", "b3"], { acks: "all", isrLagMs: 1000 }, () => t);
    rs.slow.add("b3");
    rs.send("k", 1);
    t = 500;
    rs.tick();
    expect(rs.isr.has("b3")).toBe(true);
    t = 1600;
    rs.tick();
    expect(rs.isr.has("b3")).toBe(false);
    expect(rs.receipts[0].status).toBe("acked"); // acks=all only waits for the ISR
  });

  it("min.insync.replicas rejects acks=all writes when the ISR is too small", () => {
    const c = mk();
    const rs = new ReplicaSet(c, ["b1", "b2", "b3"], { acks: "all", minInsync: 2 });
    rs.crash("b2");
    rs.crash("b3");
    rs.send("k", 1);
    expect(rs.receipts[0].status).toBe("rejected");
  });

  it("without an in-sync candidate the partition goes offline unless unclean election is on", () => {
    let t = 0;
    const c = mk();
    const rs = new ReplicaSet(c, ["b1", "b2", "b3"], { acks: "1", isrLagMs: 100 }, () => t);
    rs.slow.add("b2");
    rs.slow.add("b3");
    rs.send("k", 1);
    t = 200;
    rs.tick();
    rs.crashLeader();
    expect(rs.leader).toBeNull();
    rs.unclean = true;
    rs.revive("b1");
    expect(rs.leader).not.toBeNull();
  });

  it("no controller quorum, no election", () => {
    const c = mk();
    const rs = new ReplicaSet(c, ["b1", "b2", "b3"], { acks: "all", controllers: ["c1", "c2", "c3"] });
    rs.crashController("c1");
    expect(rs.activeController).toBe("c2");
    rs.crashController("c2");
    expect(rs.hasQuorum).toBe(false);
    rs.crashLeader();
    expect(rs.leader).toBeNull();
  });
});

describe("ReplicaSet recovery", () => {
  it("the last in-sync replica coming back brings the partition online", () => {
    const c = new Cluster(["b1", "b2", "b3"].map((name) => ({ name, partitions: 1 })));
    const rs = new ReplicaSet(c, ["b1", "b2", "b3"], { acks: "all" });
    rs.crash("b2");
    rs.crash("b3");
    rs.send("k", 1);
    rs.crash("b1");
    expect(rs.leader).toBeNull();
    rs.revive("b2");
    expect(rs.leader).toBeNull(); // b2 is behind: electing it would lose #1
    rs.revive("b1");
    expect(rs.leader).toBe("b1");
  });
});
