// Generative, adaptive background music (Tone.js) — an ORIGINAL composition in the style of
// courtroom/investigation game soundtracks: heroic minor key, galloping 16th-note synth bass,
// staccato brass stabs, punchy snare and a "pursuit" lead. No existing melody is reproduced.
//
// Intensity layers:  0 = investigation (pads + bass)  ·  1 = + drums & brass  ·  2 = pursuit
// (lead up front, faster, a whole tone higher). Every 8 bars the key climbs a semitone
// (a classic game-music lift) and resets after four lifts, so the loop keeps building.
// Ducks under explanations (GDD → Audio; learning-science §3 "background music").
type ToneNS = typeof import("tone");

export type Intensity = 0 | 1 | 2;

const BPM: Record<Intensity, number> = { 0: 132, 1: 144, 2: 156 };
const OFF_DB = -60;
/** Pursuit mode lifts the whole track a whole tone. */
const INTENSITY_LIFT: Record<Intensity, number> = { 0: 0, 1: 0, 2: 2 };
/** Key lifts every 8 bars (semitones), then back to the start. */
const MODULATIONS = [0, 1, 2, 3];

// D minor, 8 bars: i – VI – VII – V7 | i – iv – ii°7 – V7   (MIDI numbers)
const ROOTS = [38, 34, 36, 33, 38, 31, 40, 33];
const CHORDS = [
  [62, 65, 69],
  [58, 62, 65],
  [60, 64, 67],
  [57, 61, 64, 67],
  [62, 65, 69],
  [55, 58, 62],
  [52, 55, 58, 62],
  [57, 61, 64, 67],
];
// Galloping bass, per 16th step: semitones above the root (null = rest)
const BASS: (number | null)[] = [0, null, 12, 0, 0, null, 12, 0, 0, null, 12, 0, 7, null, 12, 10];
// Brass stabs (16th steps) — syncopated hits on the chord
const STABS = [0, 3, 6, 10, 12];
// Original lead, 8 bars × 16 steps (MIDI, 0 = rest)
const _ = 0;
const LEAD: number[][] = [
  [74, _, _, 69, _, 74, _, 76, 77, _, _, _, 76, _, 74, _],
  [77, _, _, 74, _, 77, _, 79, 81, _, _, _, 79, _, 77, _],
  [79, _, _, 76, _, 79, _, 81, 82, _, _, _, 81, _, 79, _],
  [81, _, _, _, 76, _, _, 73, _, 76, _, _, 81, _, _, _],
  [86, _, _, 81, _, 77, _, 74, 76, _, 77, _, 79, _, 81, _],
  [82, _, _, 79, _, 74, _, 79, 81, _, 82, _, 84, _, 86, _],
  [79, _, _, 82, _, 79, _, 76, 77, _, 79, _, 81, _, 82, _],
  [81, _, _, _, _, _, 79, _, 77, _, 76, _, 73, _, 76, _],
];
const LAYER_DB = { bass: -13, pad: -25, drums: -15, brass: -19 } as const;
const LEAD_DB: Record<Intensity, number> = { 0: OFF_DB, 1: -26, 2: -16 };

type Layers = {
  bus: InstanceType<ToneNS["Volume"]>;
  duck: InstanceType<ToneNS["Gain"]>;
  drums: InstanceType<ToneNS["Volume"]>;
  brass: InstanceType<ToneNS["Volume"]>;
  lead: InstanceType<ToneNS["Volume"]>;
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
    const limiter = new Tone.Limiter(-1).connect(bus);
    const duck = new Tone.Gain(this.ducked ? 0.3 : 1).connect(limiter);
    const room = new Tone.Reverb({ decay: 1.8, wet: 0.18 }).connect(duck);

    // Base: galloping saw bass + string pad
    const bassVol = new Tone.Volume(LAYER_DB.bass).connect(duck);
    const bass = new Tone.MonoSynth({
      oscillator: { type: "sawtooth" },
      filter: { Q: 2, type: "lowpass", rolloff: -24 },
      envelope: { attack: 0.004, decay: 0.12, sustain: 0.25, release: 0.06 },
      filterEnvelope: { attack: 0.004, decay: 0.1, sustain: 0.2, baseFrequency: 160, octaves: 3.2 },
    }).connect(bassVol);
    const padVol = new Tone.Volume(LAYER_DB.pad).connect(room);
    const padFilter = new Tone.Filter(1700, "lowpass").connect(padVol);
    const pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "fatsawtooth", count: 3, spread: 22 },
      envelope: { attack: 0.35, decay: 0.3, sustain: 0.6, release: 1 },
    }).connect(padFilter);

    // Drums
    const drums = new Tone.Volume(OFF_DB).connect(duck);
    const kick = new Tone.MembraneSynth({ pitchDecay: 0.025, octaves: 6, envelope: { attack: 0.001, decay: 0.28, sustain: 0 } }).connect(drums);
    const snareFilter = new Tone.Filter(2600, "bandpass").connect(drums);
    const snare = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.16, sustain: 0 } }).connect(snareFilter);
    const hatFilter = new Tone.Filter(9000, "highpass").connect(drums);
    const hat = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.025, sustain: 0 } }).connect(hatFilter);

    // Brass stabs
    const brass = new Tone.Volume(OFF_DB).connect(room);
    const brassFilter = new Tone.Filter(2400, "lowpass").connect(brass);
    const horns = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "sawtooth" },
      envelope: { attack: 0.012, decay: 0.14, sustain: 0.25, release: 0.08 },
    }).connect(brassFilter);

    // Lead: square with vibrato and a short echo
    const lead = new Tone.Volume(OFF_DB).connect(room);
    const echo = new Tone.FeedbackDelay("8n", 0.22).connect(lead);
    const vibrato = new Tone.Vibrato(5.5, 0.08).connect(echo);
    const leadSynth = new Tone.Synth({
      oscillator: { type: "square" },
      envelope: { attack: 0.01, decay: 0.1, sustain: 0.55, release: 0.12 },
    }).connect(vibrato);
    leadSynth.volume.value = -4;

    const transport = Tone.getTransport();
    transport.bpm.value = BPM[this.intensity];
    const n = (midi: number, shift: number) => Tone.Frequency(midi + shift, "midi").toFrequency();

    // One 16th-note grid over 8 bars drives every part, so modulations land together
    let lastTime = 0;
    let section = 0;
    const steps = Array.from({ length: 128 }, (_, i) => i);
    new Tone.Sequence(
      (time, step) => {
        // Under heavy load two steps can land on the same time; monophonic synths reject that
        if (time <= lastTime) return;
        lastTime = time;
        if (step === 0) section++;
        const shift = MODULATIONS[(section - 1) % MODULATIONS.length] + INTENSITY_LIFT[this.intensity];
        try {
          const bar = Math.floor(step / 16);
          const s16 = step % 16;
          const chord = CHORDS[bar];
          if (s16 === 0) pad.triggerAttackRelease(chord.map((m) => n(m - 12, shift)), "1m", time, 0.35);
          const b = BASS[s16];
          if (b !== null) bass.triggerAttackRelease(n(ROOTS[bar] + b, shift), "16n", time, s16 % 4 === 0 ? 0.95 : 0.7);
          if (STABS.includes(s16)) horns.triggerAttackRelease(chord.map((m) => n(m, shift)), "32n", time, s16 === 0 ? 0.8 : 0.55);
          if ([0, 6, 8, 11].includes(s16)) kick.triggerAttackRelease("C1", "8n", time, 0.85);
          if (s16 === 4 || s16 === 12) snare.triggerAttackRelease("16n", time, 0.8);
          // A snare roll into every new 8-bar section
          if (bar === 7 && s16 >= 12) snare.triggerAttackRelease("32n", time, 0.35 + (s16 - 12) * 0.12);
          hat.triggerAttackRelease("32n", time, s16 % 2 ? 0.18 : 0.35);
          const note = LEAD[bar][s16];
          if (note) leadSynth.triggerAttackRelease(n(note, shift), s16 % 4 === 0 ? "8n" : "16n", time, 0.75);
        } catch {
          // A dropped note is better than a crashed music loop
        }
      },
      steps,
      "16n",
    ).start(0);

    transport.start("+0.05");
    this.layers = { bus, duck, drums, brass, lead };
    if (!this.muted) bus.volume.rampTo(-1, 1.5);
    this.applyIntensity(0.1);
  }

  private applyIntensity(seconds: number) {
    if (!this.layers || !this.tone) return;
    this.layers.drums.volume.rampTo(this.intensity >= 1 ? LAYER_DB.drums : OFF_DB, seconds);
    this.layers.brass.volume.rampTo(this.intensity >= 1 ? LAYER_DB.brass : OFF_DB, seconds);
    this.layers.lead.volume.rampTo(LEAD_DB[this.intensity], seconds);
    this.tone.getTransport().bpm.rampTo(BPM[this.intensity], seconds * 2);
  }

  setIntensity(level: Intensity) {
    if (level === this.intensity) return;
    this.intensity = level;
    this.applyIntensity(1.2);
  }

  /** Dev/QA helper: record `ms` of the live mix (webm/opus), returned as a data URL. */
  async record(ms: number): Promise<string> {
    await this.start();
    const Tone = this.tone!;
    const rec = new Tone.Recorder();
    Tone.getDestination().connect(rec);
    rec.start();
    await new Promise((r) => setTimeout(r, ms));
    const blob = await rec.stop();
    Tone.getDestination().disconnect(rec);
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.readAsDataURL(blob);
    });
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
    this.layers.bus.volume.rampTo(muted ? -60 : -1, 0.4);
  }
}

let music: Music | null = null;
export function backgroundMusic(): Music {
  if (!music) music = new Music();
  return music;
}
