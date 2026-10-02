import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import es from "../../messages/es.json";

// Every msg("…") and choices(…, "base", [ids]) in the level files must exist in both locales.
const src = ["./world1.ts", "./world2.ts", "./world3.ts", "./world4.ts", "./world5.ts", "./world6.ts", "./world7.ts", "./world8.ts", "./world9.ts", "./world10.ts"].map((f) => readFileSync(new URL(f, import.meta.url), "utf8")).join("\n");
const keys = new Set<string>();
for (const m of src.matchAll(/msg\("([^"]+)"/g)) keys.add(m[1]);
// diagnose("s1", [ids], …) in world6 → 6-1.s1.q / .why / .<id>
for (const m of src.matchAll(/diagnose\("([^"]+)",\s*\[([^\]]+)\]/g)) {
  keys.add(`6-1.${m[1]}.q`);
  keys.add(`6-1.${m[1]}.why`);
  for (const id of m[2].matchAll(/"([^"]+)"/g)) keys.add(`6-1.${m[1]}.${id[1]}`);
}
for (const m of src.matchAll(/choices\([^,]+,\s*"([^"]+)",\s*\[([^\]]+)\]/g))
  for (const id of m[2].matchAll(/"([^"]+)"/g)) keys.add(`${m[1]}.${id[1]}`);

const get = (obj: unknown, path: string) => path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], obj);

describe("level copy", () => {
  it.each([["en", en], ["es", es]])("%s has every level message", (_, messages) => {
    const missing = [...keys].filter((k) => typeof get((messages as { levels: unknown }).levels, k) !== "string");
    expect(missing).toEqual([]);
  });
  it("found a meaningful number of keys", () => expect(keys.size).toBeGreaterThan(80));
});

describe("placeholders", () => {
  // Text/Rich pass `b` and `code` as rich-text tag functions, so a {b} value would render a function
  it("never use the names of rich-text tags", () => {
    for (const json of [en, es]) expect(JSON.stringify(json)).not.toMatch(/\{(b|code)\}/);
  });
});
