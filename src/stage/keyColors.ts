// Each key gets a "tape" colour so the player can track the same customer across belts.
// These are identity colours only — never reused for Kafka roles.
const NAMED: Record<string, string> = {
  alice: "#f472b6",
  bob: "#a3e635",
  carol: "#60a5fa",
  dave: "#fb923c",
  erin: "#f8fafc",
};
const POOL = ["#f9a8d4", "#bef264", "#93c5fd", "#fdba74", "#c4b5fd", "#fca5a5", "#fde68a", "#99f6e4"];
export const NULL_KEY_COLOR = "#64748b";

export function keyColor(key: string | null): string {
  if (key === null) return NULL_KEY_COLOR;
  if (NAMED[key]) return NAMED[key];
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return POOL[Math.abs(h) % POOL.length];
}

export const hexToNumber = (hex: string) => parseInt(hex.slice(1), 16);
