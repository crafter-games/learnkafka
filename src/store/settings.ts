import { create } from "zustand";
import { persist } from "zustand/middleware";

type Settings = {
  muted: boolean;
  toggleMuted: () => void;
};

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      muted: false,
      toggleMuted: () => set((s) => ({ muted: !s.muted })),
    }),
    { name: "kafka-express:settings" },
  ),
);
