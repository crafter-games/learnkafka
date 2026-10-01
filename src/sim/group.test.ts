import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cluster } from "./cluster";
import { DEFAULT_GROUP, GroupSim } from "./group";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const setup = (partitions: number, opts: Partial<typeof DEFAULT_GROUP> = {}) => {
  const c = new Cluster([{ name: "t", partitions }]);
  const g = new GroupSim(c, "g", "t", { ...DEFAULT_GROUP, rebalanceMs: 100, pollMs: 10, processMs: 10, ...opts });
  return { c, g };
};

describe("GroupSim", () => {
  it("gives each partition to exactly one member; extras sit idle", () => {
    const { g } = setup(3);
    for (let i = 0; i < 4; i++) g.join();
    vi.advanceTimersByTime(200);
    const owned = g.alive.flatMap((m) => m.partitions).sort();
    expect(owned).toEqual([0, 1, 2]);
    expect(g.alive.filter((m) => m.partitions.length === 0)).toHaveLength(1);
  });

  it("eager pauses every partition, cooperative only the moved ones", () => {
    const eager = setup(4, { protocol: "eager" }).g;
    eager.join();
    eager.join();
    vi.advanceTimersByTime(200);
    eager.join();
    expect(eager.lastPaused).toBe(4);
    const coop = setup(4, { protocol: "cooperative" }).g;
    coop.join();
    coop.join();
    vi.advanceTimersByTime(200);
    coop.join();
    expect(coop.lastPaused).toBe(1);
    eager.stop();
    coop.stop();
  });

  it("processes records and commits after processing", () => {
    const { c, g } = setup(1);
    for (let i = 0; i < 3; i++) c.produce("t", "k", `v${i}`);
    g.join();
    vi.advanceTimersByTime(500);
    expect(g.processedCount).toBe(3);
    expect(g.committed[0]).toBe(3);
    expect(g.lag()).toBe(0);
  });

  it("commit before processing + crash loses records (at-most-once)", () => {
    const { c, g } = setup(1, { commit: "before", maxPollRecords: 5, processMs: 100 });
    for (let i = 0; i < 5; i++) c.produce("t", "k", `v${i}`);
    g.join();
    vi.advanceTimersByTime(100 + 10 + 150); // rebalance, poll, ~1 record processed
    g.crash();
    expect(g.lost()).toBeGreaterThan(0);
  });

  it("auto-commit + crash reprocesses records (duplicates)", () => {
    const { c, g } = setup(1, { commit: "auto", autoCommitMs: 10_000 });
    for (let i = 0; i < 4; i++) c.produce("t", "k", `v${i}`);
    const first = g.join();
    vi.advanceTimersByTime(400);
    g.crash(first.id);
    g.join();
    vi.advanceTimersByTime(800);
    expect(g.duplicates).toBeGreaterThan(0);
  });

  it("auto.offset.reset=latest skips existing records", () => {
    const c = new Cluster([{ name: "t", partitions: 1 }]);
    for (let i = 0; i < 5; i++) c.produce("t", "k", "v");
    const g = new GroupSim(c, "audit", "t", { ...DEFAULT_GROUP, offsetReset: "latest" });
    expect(g.lag()).toBe(0);
    g.stop();
  });
});
