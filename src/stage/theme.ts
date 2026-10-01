// Palette sampled from the Kenney Factory Kit so UI and 3D art read as one world.
// Roles keep one colour everywhere: producer = orange, partition = indigo, consumer = teal, broker = green.
export const COLORS = {
  ground: 0xdcd8ea,
  groundEdge: 0xc9c4de,
  ink: 0x2b2840,
  producer: 0xf08a24,
  partition: 0x5b5fc7,
  consumer: 0x2fb5a3,
  broker: 0x4caf6e,
  danger: 0xe5484d,
  paper: 0xfbf8f3,
} as const;

export type StageFonts = { ui: string; mono: string };
