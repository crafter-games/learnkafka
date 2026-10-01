import { describe, expect, it } from "vitest";
import { Cluster } from "./cluster";
import { LogManager, TOMBSTONE } from "./storage";

const mk = (opts: ConstructorParameters<typeof LogManager>[2]) => {
  const c = new Cluster([{ name: "t", partitions: 1 }]);
  return { c, log: new LogManager(c, "t", opts) };
};

describe("LogManager", () => {
  it("rolls segments every segmentSize records; the last one is active", () => {
    const { c, log } = mk({ segmentSize: 4 });
    for (let i = 0; i < 9; i++) c.produce("t", "k", `v${i}`);
    const segs = log.segments(0);
    expect(segs.map((s) => [s.start, s.end, s.active])).toEqual([
      [0, 4, false],
      [4, 8, false],
      [8, 9, true],
    ]);
  });

  it("retention deletes whole closed segments and offsets are never reused", () => {
    const { c } = mk({ segmentSize: 4, retainSegments: 2 });
    for (let i = 0; i < 10; i++) c.produce("t", "k", `v${i}`);
    const t = c.topic("t");
    expect(t.logStart[0]).toBe(4);
    expect(c.produce("t", "k", "new").offset).toBe(10);
  });

  it("a consumer below the log start is reset (OffsetOutOfRange)", () => {
    const { c } = mk({ segmentSize: 2, retainSegments: 2 });
    for (let i = 0; i < 6; i++) c.produce("t", "k", `v${i}`);
    expect(c.fetch("g", "t", 0)?.offset).toBe(c.topic("t").logStart[0]);
  });

  it("compaction keeps the latest per key, leaves gaps, never touches the active segment", () => {
    const { c, log } = mk({ segmentSize: 4, policy: "compact" });
    for (const [k, v] of [["a", "1"], ["b", "1"], ["a", "2"], ["b", "2"], ["a", "3"]]) c.produce("t", k, v);
    log.clean();
    const t = c.topic("t");
    expect([...t.removed[0]].sort()).toEqual([0, 1, 2]); // a:1, b:1, a:2 superseded in the closed segment
    expect(t.isGone(0, 4)).toBe(false);
    expect(log.table()).toEqual(new Map([["a", "3"], ["b", "2"]]));
  });

  it("tombstones delete a key and disappear on a later pass", () => {
    const { c, log } = mk({ segmentSize: 2, policy: "compact" });
    c.produce("t", "a", "1");
    c.produce("t", "a", "", { [TOMBSTONE]: "1" });
    c.produce("t", "x", "filler");
    c.produce("t", "y", "filler");
    log.clean();
    expect(log.table().has("a")).toBe(false);
    expect(c.topic("t").isGone(0, 1)).toBe(false); // tombstone kept for a while
    log.clean();
    expect(c.topic("t").isGone(0, 1)).toBe(true);
  });
});
