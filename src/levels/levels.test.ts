import { describe, expect, it } from "vitest";
import { ALL_LEVELS, buildCheck, starsFor } from ".";

describe("levels", () => {
  it("every level has a brief first and a 4-question check", () => {
    for (const l of ALL_LEVELS) {
      expect(l.steps[0].kind).toBe("brief");
      expect(l.check).toHaveLength(4);
    }
  });

  it("adds one review question from an earlier level after the first", () => {
    expect(buildCheck(ALL_LEVELS[0], 1)).toHaveLength(4);
    const c = buildCheck(ALL_LEVELS[1], 1);
    expect(c).toHaveLength(5);
    expect(c.filter((q) => q.review)).toHaveLength(1);
  });

  it("a new seed regenerates numeric questions deterministically", () => {
    const a = buildCheck(ALL_LEVELS[2], 7).map((q) => q.answer);
    expect(buildCheck(ALL_LEVELS[2], 7).map((q) => q.answer)).toEqual(a);
  });

  it("every choice answer is one of its options", () => {
    for (const l of ALL_LEVELS)
      for (const q of buildCheck(l, 3))
        if (q.input.type === "choice") expect(q.input.options.map((o) => o.id)).toContain(q.answer);
  });

  it("mastery gate at 80%", () => {
    expect(starsFor(3, 4)).toBe(0);
    expect(starsFor(4, 5)).toBe(1);
    expect(starsFor(5, 5)).toBe(3);
  });
});

describe("morning shift", () => {
  it("builds one question per concept, max 5", async () => {
    const { buildReview } = await import(".");
    const q = buildReview(["record", "offset", "topic", "sticky", "parallelism", "reading"], 4);
    expect(q).toHaveLength(5);
  });
});
