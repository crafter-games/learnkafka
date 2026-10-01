// GDD palette — each Kafka role keeps one colour everywhere.
export const COLORS = {
  bg: 0x0b1020,
  panel: 0x141b34,
  producer: 0xffb020,
  partition: 0x22d3ee,
  consumer: 0xa78bfa,
  broker: 0x34d399,
  danger: 0xf43f5e,
  text: 0xe6eaf2,
  muted: 0x7c86a6,
} as const;

/** Logical stage size; the canvas scales to fit and letterboxes. */
export const STAGE = { width: 1280, height: 720 } as const;

export type StageFonts = { ui: string; mono: string };
