import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Concept } from "@/levels/types";
import { ALL_LEVELS } from "@/levels";

const DAY = 86_400_000;
/** Leitner intervals per box (days). Box 1 = due now. */
const INTERVALS = [0, 1, 2, 4, 8, 16];

type LevelResult = { stars: number; attempts: number };
type ConceptState = { box: number; due: number };

type Progress = {
  levels: Record<string, LevelResult>;
  concepts: Partial<Record<Concept, ConceptState>>;
  recordCheck: (levelId: string, stars: number, answers: { concept: Concept; correct: boolean }[]) => void;
  reset: () => void;
};

export const useProgress = create<Progress>()(
  persist(
    (set) => ({
      levels: {},
      concepts: {},
      recordCheck: (levelId, stars, answers) =>
        set((s) => {
          const prev = s.levels[levelId];
          const concepts = { ...s.concepts };
          const now = Date.now();
          for (const a of answers) {
            const c = concepts[a.concept] ?? { box: 1, due: now };
            const box = a.correct ? Math.min(5, c.box + 1) : 1;
            concepts[a.concept] = { box, due: now + INTERVALS[box] * DAY };
          }
          return {
            concepts,
            levels: { ...s.levels, [levelId]: { stars: Math.max(stars, prev?.stars ?? 0), attempts: (prev?.attempts ?? 0) + 1 } },
          };
        }),
      reset: () => set({ levels: {}, concepts: {} }),
    }),
    { name: "kafka-express:progress", version: 1 },
  ),
);

/** A level is unlocked when it's the first one or the previous level was passed (≥1 star). */
export function isUnlocked(levels: Progress["levels"], id: string) {
  const i = ALL_LEVELS.findIndex((l) => l.id === id);
  if (i <= 0) return true;
  return (levels[ALL_LEVELS[i - 1].id]?.stars ?? 0) > 0;
}
