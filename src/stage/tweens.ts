import type { Ticker } from "pixi.js";

export type Ease = (t: number) => number;
export const easeOutCubic: Ease = (t) => 1 - (1 - t) ** 3;
export const easeInOutCubic: Ease = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOutBack: Ease = (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;

type Props = Record<string, number>;
type Running = {
  obj: Props;
  from: Props;
  to: Props;
  elapsed: number;
  duration: number;
  ease: Ease;
  done: () => void;
};

/** Minimal promise-based tweens driven by the Pixi ticker. */
export class Tweens {
  private running: Running[] = [];

  constructor(ticker: Ticker) {
    ticker.add((t) => this.update(t.deltaMS));
  }

  to(target: object, to: Props, duration: number, ease: Ease = easeOutCubic) {
    const obj = target as unknown as Props;
    const from: Props = {};
    for (const k of Object.keys(to)) from[k] = obj[k];
    return new Promise<void>((done) => {
      this.running.push({ obj, from, to, elapsed: 0, duration, ease, done });
    });
  }

  private update(dt: number) {
    if (!this.running.length) return;
    const still: Running[] = [];
    for (const tw of this.running) {
      tw.elapsed += dt;
      const p = Math.min(1, tw.elapsed / tw.duration);
      const e = tw.ease(p);
      for (const k of Object.keys(tw.to)) tw.obj[k] = tw.from[k] + (tw.to[k] - tw.from[k]) * e;
      if (p < 1) still.push(tw);
      else tw.done();
    }
    this.running = still;
  }
}

export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
