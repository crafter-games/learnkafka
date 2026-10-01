// Synthesizes the M1 sound effects as 16-bit mono WAVs (original, CC0).
// Run: node scripts/gen-sfx.mjs  → public/audio/sfx/*.wav
import { writeFileSync, mkdirSync } from "node:fs";

const RATE = 44100;
const OUT = new URL("../public/audio/sfx/", import.meta.url);

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), i * 2));
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

function render(seconds, fn) {
  const n = Math.floor(seconds * RATE);
  const out = new Float32Array(n);
  let phase = 0;
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const p = i / n;
    const s = fn({ t, p, osc: (hz) => ((phase += (2 * Math.PI * hz) / RATE), Math.sin(phase)), noise: (a) => ((lp += a * (Math.random() * 2 - 1 - lp)), lp) });
    out[i] = s;
  }
  // 3 ms fade-in/out to avoid clicks
  const f = Math.floor(0.003 * RATE);
  for (let i = 0; i < f; i++) { out[i] *= i / f; out[n - 1 - i] *= i / f; }
  return out;
}

const sfx = {
  // record leaves the producer: airy rising swoosh
  produce: render(0.22, ({ p, osc, noise }) => {
    const env = Math.sin(Math.PI * p) ** 2;
    return env * (0.35 * noise(0.08 + 0.3 * p) + 0.18 * osc(320 + 420 * p));
  }),
  // record appended & stamped with its offset: soft thunk + click
  stamp: render(0.16, ({ t, p, osc, noise }) => {
    const body = Math.exp(-t * 32) * osc(150 - 80 * p) * 0.8;
    const click = t < 0.006 ? noise(0.9) * 0.6 : 0;
    return body + click;
  }),
  // key hashed to a partition: two quick rising blips
  hash: render(0.14, ({ t, osc }) => {
    const hz = t < 0.06 ? 880 : 1320;
    const local = t < 0.06 ? t : t - 0.07;
    const env = local >= 0 ? Math.exp(-local * 55) : 0;
    return env * osc(hz) * 0.3;
  }),
  // generic UI click
  click: render(0.05, ({ t, osc }) => Math.exp(-t * 120) * osc(1600) * 0.35),
};

mkdirSync(OUT, { recursive: true });
for (const [name, samples] of Object.entries(sfx)) {
  writeFileSync(new URL(`${name}.wav`, OUT), wav(samples));
  console.log(`wrote ${name}.wav (${samples.length} samples)`);
}
