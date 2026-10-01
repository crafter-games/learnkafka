// Generative, adaptive background music (Tone.js) — original, no assets.
// Vertical layering: base (pad + bass) → groove (kick/hat) → rush (arpeggio).
// Ducks under explanations (GDD → Audio; learning-science §3 "background music").
type ToneNS = typeof import("tone");

export type Intensity = 0 | 1 | 2;

const BPM = 84;
const OFF_DB = -60;
// i–VI–III–VII in A minor with 7ths: calm lo-fi loop, 4 bars
const CHORDS = [
  ["A3", "C4", "E4", "G4"],
  ["F3", "A3", "C4", "E4"],
  ["C4", "E4", "G4", "B4"],
  ["G3", "B3", "D4", "E4"],
];
const BASS = ["A1", "F1", "C2", "G1"];
const LAYER_DB = { pad: -17, bass: -15, groove: -20, arp: -24 } as const;

type Layers = {
  bus: InstanceType<ToneNS["Volume"]>;
  duck: InstanceType<ToneNS["Gain"]>;
  groove: InstanceType<ToneNS["Volume"]>;
  arp: InstanceType<ToneNS["Volume"]>;
};

class Music {
  private tone: ToneNS | null = null;
  private layers: Layers | null = null;
  private starting: Promise<void> | null = null;
  private intensity: Intensity = 0;
  private muted = false;
  private ducked = false;

  get started() {
    return this.layers !== null;
  }

  /** Must be called from a user gesture (autoplay policy). Safe to call repeatedly. */
  start(): Promise<void> {
    if (!this.starting) this.starting = this.boot();
    return this.starting;
  }

  private async boot() {
    const Tone = await import("tone");
    this.tone = Tone;
    await Tone.start();

    const bus = new Tone.Volume(-60).toDestination();
    const limiter = new Tone.Limiter(-3).connect(bus);
    const duck = new Tone.Gain(this.ducked ? 0.3 : 1).connect(limiter);
    const reverb = new Tone.Reverb({ decay: 5, wet: 0.4 }).connect(duck);
    const warm = new Tone.Filter(1600, "lowpass").connect(reverb);

    // Base: soft pad + round bass
    const padVol = new Tone.Volume(LAYER_DB.pad).connect(warm);
    const pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 1.4, decay: 0.6, sustain: 0.7, release: 3 },
    }).connect(padVol);
    const bassVol = new Tone.Volume(LAYER_DB.bass).connect(duck);
    const bass = new Tone.MonoSynth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.02, decay: 0.3, sustain: 0.6, release: 0.8 },
      filterEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.4, baseFrequency: 120, octaves: 2 },
    }).connect(bassVol);

    // Groove: dusty kick + hat (fades in while playing)
    const groove = new Tone.Volume(OFF_DB).connect(duck);
    const kick = new Tone.MembraneSynth({ pitchDecay: 0.03, octaves: 5, envelope: { attack: 0.001, decay: 0.35, sustain: 0 } }).connect(groove);
    const hatFilter = new Tone.Filter(7000, "highpass").connect(groove);
    const hat = new Tone.NoiseSynth({ noise: { type: "pink" }, envelope: { attack: 0.001, decay: 0.05, sustain: 0 } }).connect(hatFilter);

    // Rush: plucky arpeggio through a dotted-8th delay (busy traffic)
    const arp = new Tone.Volume(OFF_DB).connect(warm);
    const delay = new Tone.FeedbackDelay("8n.", 0.3).connect(arp);
    const pluck = new Tone.Synth({
      oscillator: { type: "square" },
      envelope: { attack: 0.005, decay: 0.15, sustain: 0.1, release: 0.3 },
    }).connect(delay);
    pluck.volume.value = -8;

    const transport = Tone.getTransport();
    transport.bpm.value = BPM;
    transport.swing = 0.15;
    transport.swingSubdivision = "8n";

    let bar = 0;
    new Tone.Loop((time) => {
      const i = bar % CHORDS.length;
      pad.triggerAttackRelease(CHORDS[i], "1m", time, 0.45);
      bass.triggerAttackRelease(BASS[i], "4n.", time, 0.8);
      bass.triggerAttackRelease(BASS[i], "8n", time + Tone.Time("2n").toSeconds() + Tone.Time("8n").toSeconds(), 0.5);
      bar++;
    }, "1m").start(0);

    const kicks = [1, 0, 0, 0, 0, 1, 1, 0];
    new Tone.Sequence((time, hit) => hit && kick.triggerAttackRelease("A0", "8n", time, 0.7), kicks, "8n").start(0);
    new Tone.Sequence((time, v) => v && hat.triggerAttackRelease("16n", time, v), [0, 0.25, 0, 0.35, 0, 0.25, 0, 0.4], "8n").start(0);

    let step = 0;
    new Tone.Loop((time) => {
      const chord = CHORDS[Math.floor(Tone.getTransport().ticks / Tone.Time("1m").toTicks()) % CHORDS.length];
      const order = [0, 1, 2, 3, 2, 1];
      const note = Tone.Frequency(chord[order[step % order.length]]).transpose(12);
      pluck.triggerAttackRelease(note.toFrequency(), "16n", time, 0.6);
      step++;
    }, "16n").start(0);

    transport.start("+0.05");
    this.layers = { bus, duck, groove, arp };
    if (!this.muted) bus.volume.rampTo(-6, 2.5);
    this.applyIntensity(0.1);
  }

  private applyIntensity(seconds: number) {
    if (!this.layers) return;
    this.layers.groove.volume.rampTo(this.intensity >= 1 ? LAYER_DB.groove : OFF_DB, seconds);
    this.layers.arp.volume.rampTo(this.intensity >= 2 ? LAYER_DB.arp : OFF_DB, seconds);
  }

  setIntensity(level: Intensity) {
    if (level === this.intensity) return;
    this.intensity = level;
    this.applyIntensity(1.5);
  }

  /** Music dips ~10 dB while the player reads an explanation. */
  duck(active: boolean) {
    this.ducked = active;
    this.layers?.duck.gain.rampTo(active ? 0.3 : 1, active ? 0.25 : 0.8);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (!this.layers) return;
    this.layers.bus.volume.cancelScheduledValues(this.tone!.now());
    this.layers.bus.volume.rampTo(muted ? -60 : -6, 0.4);
  }
}

let music: Music | null = null;
export function backgroundMusic(): Music {
  if (!music) music = new Music();
  return music;
}
