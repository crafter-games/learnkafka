import { seeded, type Level, type Question } from "./types";
import { WORLD1 } from "./world1";

export const WORLDS = [{ id: 1, levels: WORLD1 }] as const;
export const ALL_LEVELS: Level[] = WORLDS.flatMap((w) => w.levels);

export const getLevel = (id: string) => ALL_LEVELS.find((l) => l.id === id);

export function nextLevel(id: string): Level | undefined {
  const i = ALL_LEVELS.findIndex((l) => l.id === id);
  return i >= 0 ? ALL_LEVELS[i + 1] : undefined;
}

export function previousLevel(id: string): Level | undefined {
  const i = ALL_LEVELS.findIndex((l) => l.id === id);
  return i > 0 ? ALL_LEVELS[i - 1] : undefined;
}

export type BuiltQuestion = ReturnType<Question["build"]> & { concept: Question["concept"]; review: boolean };

/**
 * The recall check: the level's own questions plus one review question from an
 * earlier level (spacing + interleaving). A new seed gives new numbers/order.
 */
export function buildCheck(level: Level, seed: number): BuiltQuestion[] {
  const rng = seeded(seed);
  const own = level.check.map((q) => ({ ...q.build(rng), concept: q.concept, review: false }));
  const earlier = ALL_LEVELS.slice(0, ALL_LEVELS.findIndex((l) => l.id === level.id)).flatMap((l) => l.check);
  if (!earlier.length) return own;
  const pick = earlier[Math.floor(rng() * earlier.length)];
  return [...own, { ...pick.build(rng), concept: pick.concept, review: true }];
}

export const PASS_RATIO = 0.8;

export function starsFor(correct: number, total: number): 0 | 1 | 2 | 3 {
  const r = correct / total;
  if (r < PASS_RATIO) return 0;
  if (r === 1) return 3;
  return r >= 0.9 ? 2 : 1;
}
