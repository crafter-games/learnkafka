import { seeded, type Level, type Question } from "./types";
import { WORLD1 } from "./world1";
import { WORLD2 } from "./world2";
import { WORLD3 } from "./world3";
import { WORLD4 } from "./world4";
import { WORLD5 } from "./world5";
import { WORLD6 } from "./world6";
import { WORLD7 } from "./world7";
import { WORLD8 } from "./world8";
import { WORLD9 } from "./world9";
import { WORLD10 } from "./world10";

export const WORLDS = [
  { id: 1, levels: WORLD1 },
  { id: 2, levels: WORLD2 },
  { id: 3, levels: WORLD3 },
  { id: 4, levels: WORLD4 },
  { id: 5, levels: WORLD5 },
  { id: 6, levels: WORLD6 },
  { id: 7, levels: WORLD7 },
  { id: 8, levels: WORLD8 },
  { id: 9, levels: WORLD9 },
  { id: 10, levels: WORLD10 },
] as const;
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

/** Morning shift: one question per due concept (weakest first), interleaved, 3–5 questions. */
export function buildReview(concepts: Question["concept"][], seed: number): BuiltQuestion[] {
  const rng = seeded(seed);
  const pool = ALL_LEVELS.flatMap((l) => l.check);
  const picked = concepts.slice(0, 5).map((c) => {
    const options = pool.filter((q) => q.concept === c);
    return options[Math.floor(rng() * options.length)];
  });
  // Interleave: shuffle so related concepts aren't back to back
  for (let i = picked.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [picked[i], picked[j]] = [picked[j], picked[i]];
  }
  return picked.filter(Boolean).map((q) => ({ ...q.build(rng), concept: q.concept, review: false }));
}
