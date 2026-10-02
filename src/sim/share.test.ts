import { describe, expect, it } from "vitest";
import { Cluster } from "./cluster";
import { shareCapacity, ShareGroup, throughput } from "./share";

const setup = (mode: "classic" | "share", poison: string[] = []) => {
  let now = 0;
  const c = new Cluster([{ name: "jobs", partitions: 2 }]);
  const g = new ShareGroup(c, "jobs", mode, { processMs: 100, lockMs: 500, deliveryLimit: 5, poisonKeys: poison }, () => now);
  return { c, g, step: (ms: number) => { now += ms; g.tick(); } };
};

describe("ShareGroup", () => {
  it("a classic group leaves members beyond the partition count idle; a share group uses all of them", () => {
    const classic = setup("classic");
    for (let i = 0; i < 4; i++) classic.g.join();
    expect(classic.g.idle).toBe(2);
    const share = setup("share");
    for (let i = 0; i < 4; i++) share.g.join();
    for (let i = 0; i < 8; i++) share.c.produce("jobs", `k${i}`, "job", {}, i % 2);
    share.step(0);
    expect(share.g.members.filter((m) => m.holding)).toHaveLength(4);
    for (let i = 0; i < 4; i++) share.step(100);
    expect(share.g.processed).toBe(8);
  });

  it("a crashed member's lock expires and the record is redelivered", () => {
    const { c, g, step } = setup("share");
    g.join();
    c.produce("jobs", "a", "job", {}, 0);
    step(0);
    g.crash();
    g.join();
    step(100);
    expect(g.processed).toBe(0);
    step(500); // lock expired → available → the new member takes it
    step(100);
    expect(g.processed).toBe(1);
    expect(g.redeliveries).toBe(1);
  });

  it("a poison record is archived at the delivery limit when released, or at once when rejected", () => {
    const released = setup("share", ["bad"]);
    released.g.join();
    released.c.produce("jobs", "bad", "job", {}, 0);
    for (let i = 0; i < 20; i++) released.step(100);
    const r = [...released.g.records.values()][0];
    expect([r.state, r.deliveries]).toEqual(["archived", 5]);

    const rejected = setup("share", ["bad"]);
    rejected.g.onFailure = "reject";
    rejected.g.join();
    rejected.c.produce("jobs", "bad", "job", {}, 0);
    rejected.step(0);
    rejected.step(100);
    expect([...rejected.g.records.values()][0].deliveries).toBe(1);
    expect(rejected.g.archived).toBe(1);
  });
});

describe("performance", () => {
  it("sequential I/O dwarfs random; TLS turns zero-copy off; batching matters", () => {
    expect(throughput({ sequential: true, zeroCopy: true, tls: false, batch: 100 })).toBe(600);
    expect(throughput({ sequential: false, zeroCopy: true, tls: false, batch: 100 })).toBeLessThan(1);
    expect(throughput({ sequential: true, zeroCopy: true, tls: true, batch: 100 })).toBe(throughput({ sequential: true, zeroCopy: false, tls: false, batch: 100 }));
    expect(throughput({ sequential: true, zeroCopy: true, tls: false, batch: 1 })).toBeLessThan(100);
  });

  it("a noisy client starves others until a quota throttles it", () => {
    const free = shareCapacity(100, [{ id: "orders", demand: 50 }, { id: "analytics", demand: 200 }]);
    expect(free.get("orders")!.got).toBe(20);
    const capped = shareCapacity(100, [{ id: "orders", demand: 50 }, { id: "analytics", demand: 200, quota: 50 }]);
    expect(capped.get("orders")!.got).toBe(50);
    expect(capped.get("analytics")!.throttleMs).toBeGreaterThan(0);
  });
});
