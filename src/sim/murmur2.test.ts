import { describe, expect, it } from "vitest";
import { murmur2, partitionForKey } from "./murmur2";

const enc = new TextEncoder();

describe("murmur2", () => {
  // Vectors from Kafka's UtilsTest.testMurmur2
  it.each([
    ["21", -973932308],
    ["foobar", -790332482],
    ["a-little-bit-long-string", -985981536],
    ["a-little-bit-longer-string", -1486304829],
    ["lkjh234lh9fiuh90y23oiuhsafujhadof229phr9h19h89h8", -58897971],
    ["abc", 479470107],
  ])("hashes %s like the Java client", (input, expected) => {
    expect(murmur2(enc.encode(input))).toBe(expected);
  });

  it("maps a key to a stable partition", () => {
    const p = partitionForKey("alice", 3);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThan(3);
    expect(partitionForKey("alice", 3)).toBe(p);
  });
});
