import { Random } from "../utils/random";
import { HICAZ_D, type SynthLibrary } from "./SynthLibrary";

export type MusicTheme = "map" | "istanbul" | "tension" | "victory";

interface ThemeDef {
  bpm: number;
  /** Rhythm cycle (usul) — D = düm (low), T = tek (high), K = soft, '.' = rest; one char per 8th note. */
  usul: string;
  drum: "davul" | "kudum";
  melody: "ney" | "pluck" | "zurna" | "mixed";
  melodyDensity: number;
  droneRoot: number;
  volume: number;
}

const THEMES: Record<MusicTheme, ThemeDef> = {
  map: { bpm: 62, usul: "K.......T.......", drum: "kudum", melody: "ney", melodyDensity: 0.35, droneRoot: 73.42, volume: 0.9 },
  istanbul: { bpm: 84, usul: "D.TTD.T.", drum: "kudum", melody: "mixed", melodyDensity: 0.5, droneRoot: 73.42, volume: 0.85 },
  tension: { bpm: 104, usul: "D.D.T.D.DDT.T.T.", drum: "davul", melody: "zurna", melodyDensity: 0.45, droneRoot: 73.42, volume: 0.9 },
  victory: { bpm: 112, usul: "D.T.D.T.DDT.D.T.", drum: "davul", melody: "zurna", melodyDensity: 0.75, droneRoot: 73.42, volume: 1 },
};

/**
 * Generative, makam-inspired background music. Phrases are random walks in Hicaz (seeded),
 * resolving to the tonic, over a usul (rhythmic cycle) and a drone. Uses a classic
 * look-ahead scheduler so timing stays sample-accurate.
 */
export class MusicSequencer {
  private theme: MusicTheme | null = null;
  private themeGain: GainNode | null = null;
  private timer: number | null = null;
  private nextTime = 0;
  private step = 0;
  private rng = new Random(1453);
  private phrase: { degree: number; steps: number }[] = [];
  private phraseIndex = 0;
  private noteStepsLeft = 0;
  private degree = 4;
  private lastDroneStep = -999;

  constructor(
    private readonly ctx: AudioContext,
    private readonly out: AudioNode,
    private readonly synth: SynthLibrary,
  ) {}

  play(theme: MusicTheme): void {
    if (theme === this.theme) return;
    this.fadeOutCurrent(1.8);
    this.theme = theme;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(THEMES[theme].volume, this.ctx.currentTime + 2);
    g.connect(this.out);
    this.themeGain = g;
    this.step = 0;
    this.lastDroneStep = -999;
    this.phrase = [];
    this.nextTime = this.ctx.currentTime + 0.1;
    if (this.timer === null) this.timer = window.setInterval(() => this.tick(), 60);
  }

  stop(fade: number): void {
    this.fadeOutCurrent(fade);
    this.theme = null;
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  private fadeOutCurrent(fade: number): void {
    const g = this.themeGain;
    if (!g) return;
    const t = this.ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + fade);
    window.setTimeout(() => g.disconnect(), (fade + 4) * 1000);
    this.themeGain = null;
  }

  private tick(): void {
    if (!this.theme || !this.themeGain) return;
    if (this.ctx.state !== "running") {
      this.nextTime = this.ctx.currentTime + 0.1;
      return;
    }
    const def = THEMES[this.theme];
    const stepDur = 60 / def.bpm / 2;
    while (this.nextTime < this.ctx.currentTime + 0.3) {
      this.scheduleStep(def, this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step++;
    }
  }

  private newPhrase(def: ThemeDef): void {
    const len = this.rng.int(4, 7);
    const phrase: { degree: number; steps: number }[] = [];
    let d = this.rng.pick([2, 3, 4, 4, 5]);
    for (let i = 0; i < len; i++) {
      d = Math.max(0, Math.min(7, d + this.rng.pick([-2, -1, -1, 1, 1, 2, 0])));
      const long = def.melody === "ney" ? this.rng.pick([2, 3, 4, 4, 6]) : this.rng.pick([1, 1, 2, 2, 3]);
      phrase.push({ degree: d, steps: long });
    }
    // Cadence: Hicaz descends through the augmented second to rest on the tonic.
    phrase.push({ degree: 2, steps: 2 }, { degree: 1, steps: 1 }, { degree: 0, steps: def.melody === "ney" ? 6 : 4 });
    this.phrase = phrase;
    this.phraseIndex = 0;
  }

  private scheduleStep(def: ThemeDef, step: number, t: number, stepDur: number): void {
    const g = this.themeGain!;
    const ch = def.usul[step % def.usul.length];
    if (def.drum === "davul") {
      if (ch === "D") this.synth.davul(t, g, 0.5, true);
      else if (ch === "T") this.synth.davul(t, g, 0.32, false);
      else if (ch === "K") this.synth.kudum(t, g, 0.18, false);
    } else {
      if (ch === "D") this.synth.kudum(t, g, 0.32, false);
      else if (ch === "T") this.synth.kudum(t, g, 0.22, true);
      else if (ch === "K") this.synth.kudum(t, g, 0.14, false);
    }

    const droneEvery = 32;
    if (step - this.lastDroneStep >= droneEvery) {
      this.lastDroneStep = step;
      this.synth.drone(t, def.droneRoot, stepDur * droneEvery + 1.5, g, 0.035);
    }

    if (this.noteStepsLeft > 0) {
      this.noteStepsLeft--;
      return;
    }
    if (this.phraseIndex >= this.phrase.length) {
      // Rest between phrases.
      if (this.rng.next() > def.melodyDensity) {
        this.noteStepsLeft = this.rng.int(2, 6);
        return;
      }
      this.newPhrase(def);
    }
    const note = this.phrase[this.phraseIndex++];
    this.degree = note.degree;
    const freq = HICAZ_D[this.degree];
    const dur = note.steps * stepDur;
    const kind = def.melody === "mixed" ? (this.rng.next() < 0.65 ? "pluck" : "ney") : def.melody;
    if (kind === "ney") this.synth.ney(t, freq, dur * 0.95, g, 0.13);
    else if (kind === "pluck") {
      this.synth.pluck(t, freq, g, 0.17);
      if (note.steps >= 2) this.synth.pluck(t + stepDur, freq, g, 0.1);
    } else this.synth.zurna(t, freq, dur * 0.9, g, 0.085);
    this.noteStepsLeft = note.steps - 1;
  }
}
