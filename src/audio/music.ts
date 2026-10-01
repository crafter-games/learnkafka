// Generative, adaptive background music (Tone.js) — original, no assets.
// A cheerful C-major loop (I–V–vi–IV) in vertical layers:
//   base   marimba (tresillo) + bouncing bass + soft pad   → menus
//   groove kick / clap / shaker + a quiet melody            → playing
//   rush   melody up front + glockenspiel sparkle          → busy traffic
// Ducks under explanations (GDD → Audio; learning-science §3 "background music").
type ToneNS = typeof import("tone");

export type Intensity = 0 | 1 | 2;

const BPM = 112;
const OFF_DB = -60;
// One chord per bar: C – G – Am – F
const CHORDS = [
  ["C4", "E4", "G4"],
  ["B3", "D4", "G4"],
  ["C4", "E4", "A4"],
  ["C4", "F4", "A4"],
];
const ROOTS = ["C2", "G1", "A1", "F1"];
const FIFTHS = ["G2", "D2", "E2", "C2"];
// 4-bar hook on an 8th-note grid (null = rest)
const MELODY: (string | null)[] = [
  "E5", null, "G5", null, "A5", "G5", "E5", null,
  "D5", null, "G5", null, "B5", null, "A5", "G5",
  "C5", null, "E5", null, "A5", null, "G5", "E5",
  "F5", null, "A5", null, "G5", null, "E5", "D5",
];
const TRESILLO = [1, 0, 0, 1, 0, 0, 1, 0];
const LAYER_DB = { marimba: -15, pad: -24, bass: -13, groove: -17 } as const;
const MELODY_DB: Record<Intensity, number> = { 0: OFF_DB, 1: -25, 2: -17 };
const SPARKLE_DB: Record<Intensity, number> = { 0: OFF_DB, 1: OFF_DB, 2: -26 };

type Layers = {
  bus: InstanceType<ToneNS["Volume"]>;
  duck: InstanceType<ToneNS["Gain"]>;
  groove: InstanceType<ToneNS["Volume"]>;
  melody: InstanceType<ToneNS["Volume"]>;
  sparkle: InstanceType<ToneNS["Volume"]>;
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
    // A little more scheduling headroom so a busy main thread (3D scenes) doesn't collapse note times
    Tone.getContext().lookAhead = 0.2;

    const bus = new Tone.Volume(-60).toDestination();
    const limiter = new Tone.Limiter(-3).connect(bus);
    const duck = new Tone.Gain(this.ducked ? 0.3 : 1).connect(limiter);
    const reverb = new Tone.Reverb({ decay: 2.2, wet: 0.22 }).connect(duck);

    // Base: wooden marimba stabs, round bouncing bass, a whisper of pad
    const marimbaVol = new Tone.Volume(LAYER_DB.marimba).connect(reverb);
    const marimba = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "sine" },
      envelope: { attack: 0.002, decay: 0.28, sustain: 0, release: 0.2 },
    }).connect(marimbaVol);
    const padVol = new Tone.Volume(LAYER_DB.pad).connect(reverb);
    const pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.6, decay: 0.4, sustain: 0.6, release: 1.2 },
    }).connect(padVol);
    const bassVol = new Tone.Volume(LAYER_DB.bass).connect(duck);
    const bass = new Tone.MonoSynth({
      oscillator: { type: "triangle" },
      envelope: { attack: 0.005, decay: 0.18, sustain: 0.3, release: 0.15 },
      filterEnvelope: { attack: 0.005, decay: 0.12, sustain: 0.3, baseFrequency: 180, octaves: 2.5 },
    }).connect(bassVol);

    // Groove: kick, hand clap, shaker
    const groove = new Tone.Volume(OFF_DB).connect(duck);
    const kick = new Tone.MembraneSynth({ pitchDecay: 0.02, octaves: 5, envelope: { attack: 0.001, decay: 0.25, sustain: 0 } }).connect(groove);
    const clapFilter = new Tone.Filter(1800, "bandpass").connect(groove);
    const clap = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.12, sustain: 0 } }).connect(clapFilter);
    const shakerFilter = new Tone.Filter(8000, "highpass").connect(groove);
    const shaker = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.002, decay: 0.03, sustain: 0 } }).connect(shakerFilter);

    // Melody: a bright square lead with a little slapback, and a glockenspiel sparkle
    const melodyVol = new Tone.Volume(OFF_DB).connect(reverb);
    const slap = new Tone.FeedbackDelay("8n", 0.18).connect(melodyVol);
    const lead = new Tone.Synth({
      oscillator: { type: "square" },
      envelope: { attack: 0.005, decay: 0.12, sustain: 0.25, release: 0.12 },
    }).connect(slap);
    lead.volume.value = -6;
    const sparkleVol = new Tone.Volume(OFF_DB).connect(reverb);
    const glock = new Tone.Synth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.3 },
    }).connect(sparkleVol);

    const transport = Tone.getTransport();
    transport.bpm.value = BPM;
    transport.swing = 0.06;
    transport.swingSubdivision = "8n";

    // One 32-step (4-bar) sequencer drives every part so they stay locked together
    const steps = Array.from({ length: 32 }, (_, i) => i);
    let lastTime = 0;
    new Tone.Sequence(
      (time, step) => {
        // Under heavy load two steps can land on the same time; monophonic synths reject that
        if (time <= lastTime) return;
        lastTime = time;
        try {
          playStep(time, step);
        } catch {
          // A dropped note is better than a crashed music loop
        }
      },
      steps,
      "8n",
    ).start(0);

    function playStep(time: number, step: number) {
        const bar = Math.floor(step / 8);
        const s8 = step % 8;
        const chord = CHORDS[bar];
        if (TRESILLO[s8]) marimba.triggerAttackRelease(chord, "16n", time, s8 === 0 ? 0.8 : 0.55);
        if (s8 === 0) pad.triggerAttackRelease(chord, "1m", time, 0.3);
        if (s8 === 0 || s8 === 4) bass.triggerAttackRelease(ROOTS[bar], "8n", time, 0.9);
        if (s8 === 3) bass.triggerAttackRelease(Tone.Frequency(ROOTS[bar]).transpose(12).toNote(), "16n", time, 0.6);
        if (s8 === 6) bass.triggerAttackRelease(FIFTHS[bar], "16n", time, 0.7);
        if (s8 === 0 || s8 === 4) kick.triggerAttackRelease("C1", "8n", time, 0.8);
        if (s8 === 2 || s8 === 6) clap.triggerAttackRelease("16n", time, 0.5);
        shaker.triggerAttackRelease("32n", time, s8 % 2 ? 0.35 : 0.18);
        const note = MELODY[step];
        if (note) {
          lead.triggerAttackRelease(note, "16n", time, 0.7);
          if (s8 % 4 === 0) glock.triggerAttackRelease(Tone.Frequency(note).transpose(12).toNote(), "16n", time, 0.5);
        }
    }

    transport.start("+0.05");
    this.layers = { bus, duck, groove, melody: melodyVol, sparkle: sparkleVol };
    if (!this.muted) bus.volume.rampTo(-6, 1.5);
    this.applyIntensity(0.1);
  }

  private applyIntensity(seconds: number) {
    if (!this.layers) return;
    this.layers.groove.volume.rampTo(this.intensity >= 1 ? LAYER_DB.groove : OFF_DB, seconds);
    this.layers.melody.volume.rampTo(MELODY_DB[this.intensity], seconds);
    this.layers.sparkle.volume.rampTo(SPARKLE_DB[this.intensity], seconds);
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
