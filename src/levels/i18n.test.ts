import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import es from "../../messages/es.json";

// Every msg("…") and choices(…, "base", [ids]) in the level files must exist in both locales.
const src = readFileSync(new URL("./world1.ts", import.meta.url), "utf8");
const keys = new Set<string>();
for (const m of src.matchAll(/msg\("([^"]+)"/g)) keys.add(m[1]);
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
