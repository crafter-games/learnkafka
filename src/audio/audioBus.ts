import { Howl, Howler } from "howler";
import type { SimEvent } from "@/sim/events";

// Every SFX key maps to a Kafka event (GDD → Audio). Music lives in ./music.ts.
export const SFX = {
  produce: "/audio/sfx/produce.wav",
  stamp: "/audio/sfx/stamp.wav",
  hash: "/audio/sfx/hash.wav",
  click: "/audio/sfx/click.wav",
  blip: "/audio/sfx/blip.wav",
  unlock: "/audio/sfx/unlock.wav",
  correct: "/audio/sfx/correct.wav",
  wrong: "/audio/sfx/wrong.wav",
} as const;

export type SfxKey = keyof typeof SFX;

const BUS_VOLUME = { sfx: 0.8, ui: 0.5 } as const;

class AudioBus {
  private sounds = new Map<SfxKey, Howl>();

  private get(key: SfxKey): Howl {
    let h = this.sounds.get(key);
    if (!h) {
      h = new Howl({ src: [SFX[key]], preload: true });
      this.sounds.set(key, h);
    }
    return h;
  }

  preload() {
    (Object.keys(SFX) as SfxKey[]).forEach((k) => this.get(k));
  }

  play(key: SfxKey, opts: { bus?: keyof typeof BUS_VOLUME; rate?: number } = {}) {
    const h = this.get(key);
    const id = h.play();
    h.volume(BUS_VOLUME[opts.bus ?? "sfx"], id);
    // ±6% pitch variation keeps repeated events from sounding mechanical
    h.rate(opts.rate ?? 0.94 + Math.random() * 0.12, id);
  }

  setMuted(muted: boolean) {
    Howler.mute(muted);
  }

  /** Sim → sound. Stamp plays from the stage when the parcel lands, to stay in sync with the visual. */
  handleSimEvent(event: SimEvent) {
    if (event.type === "produced") {
      this.play("produce");
      if (event.hashed) this.play("hash");
    }
  }
}

let bus: AudioBus | null = null;
export function audioBus(): AudioBus {
  if (!bus) bus = new AudioBus();
  return bus;
}
