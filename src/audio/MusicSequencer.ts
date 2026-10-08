import { Random } from "../utils/random";
import { HICAZ_D, HUSEYNI_A, USSAK_D, type SynthLibrary } from "./SynthLibrary";

export type MusicTheme = "map" | "istanbul" | "tension" | "victory" | "mugla" | "dugun" | "ankara" | "kayseri";

/** A fixed arrangement (instead of generative phrases): MIDI notes in eighth-note steps, 0 = rest. */
interface Score {
  melody: [number, number][];
  /** One chord root (MIDI) per bar; the bass alternates root and fifth on the quarter notes. */
  bassRoots: number[];
}

/**
 * "Dağ Başını Duman Almış" — instrumental march arrangement (melody of the 19th-century public
 * domain song it is based on, played from memory by the synthesizer; no lyrics are used).
 * A recording can replace it: see MUSIC_SAMPLE_MANIFEST in AudioManager.
 */
const DAG_BASINI: Score = (() => {
  const L1: [number, number][] = [[67, 2], [67, 1], [69, 1], [71, 2], [71, 2], [69, 2], [67, 1], [69, 1], [71, 4]];
  const L2: [number, number][] = [[72, 2], [72, 1], [71, 1], [69, 2], [69, 2], [71, 2], [69, 1], [67, 1], [69, 4]];
  const L3: [number, number][] = [[71, 2], [71, 1], [72, 1], [74, 2], [74, 2], [76, 2], [74, 1], [72, 1], [71, 4]];
  const L4: [number, number][] = [[69, 2], [71, 1], [72, 1], [71, 2], [69, 2], [67, 4], [0, 4]];
  const L5: [number, number][] = [[74, 2], [74, 1], [74, 1], [76, 2], [74, 2], [72, 2], [71, 2], [69, 4]];
  const L6: [number, number][] = [[71, 2], [72, 1], [74, 1], [72, 2], [71, 2], [69, 2], [71, 2], [67, 4]];
  const G = 43, C = 48, D = 50, E = 40;
  return {
    melody: [...L1, ...L2, ...L3, ...L4, ...L5, ...L6, ...L5, ...L6, [0, 8]],
    bassRoots: [G, G, C, D, G, E, D, G, G, C, D, G, G, C, D, G, D],
  };
})();

interface ThemeDef {
  bpm: number;
  /** Rhythm cycle (usul) — D = düm (low), T = tek (high), K = soft, '.' = rest; one char per 8th note. */
  usul: string;
  drum: "davul" | "kudum";
  melody: "ney" | "pluck" | "zurna" | "mixed";
  melodyDensity: number;
  droneRoot: number;
  volume: number;
  /** Scale degrees in Hz (Hicaz for the Ottoman court/mehter, Hüseyni for Aegean folk). */
  scale?: readonly number[];
  score?: Score;
}

const THEMES: Record<MusicTheme, ThemeDef> = {
  map: { bpm: 62, usul: "K.......T.......", drum: "kudum", melody: "ney", melodyDensity: 0.35, droneRoot: 73.42, volume: 0.9 },
  istanbul: { bpm: 84, usul: "D.TTD.T.", drum: "kudum", melody: "mixed", melodyDensity: 0.5, droneRoot: 73.42, volume: 0.85 },
  tension: { bpm: 104, usul: "D.D.T.D.DDT.T.T.", drum: "davul", melody: "zurna", melodyDensity: 0.45, droneRoot: 73.42, volume: 0.9 },
  victory: { bpm: 112, usul: "D.T.D.T.DDT.D.T.", drum: "davul", melody: "zurna", melodyDensity: 0.75, droneRoot: 73.42, volume: 1 },
  // Muğla is zeybek country: a slow, heavy 9/8 (2+2+2+3) on the davul with bağlama-like plucks.
  mugla: { bpm: 96, usul: "D.T.T.D..", drum: "kudum", melody: "mixed", melodyDensity: 0.45, droneRoot: 110, volume: 0.8, scale: HUSEYNI_A },
  // Wedding (düğün): davul-zurna in a lively 9/8 karşılama.
  dugun: { bpm: 150, usul: "D.T.D.TT.", drum: "davul", melody: "zurna", melodyDensity: 0.8, droneRoot: 110, volume: 0.95, scale: HUSEYNI_A },
  // Ankara 1920: a brass-and-snare march (4/4, one char per 8th note).
  ankara: { bpm: 104, usul: "D.S.T.S.", drum: "davul", melody: "pluck", melodyDensity: 1, droneRoot: 98, volume: 0.62, score: DAG_BASINI },
  // Kayseri bazaar: an unhurried sofyan-like 4/4 on the kudüm with bağlama plucks and ney in Uşşak.
  kayseri: { bpm: 90, usul: "D..TK.T.D.T.K.T.", drum: "kudum", melody: "mixed", melodyDensity: 0.55, droneRoot: 73.42, volume: 0.78, scale: USSAK_D },
};

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

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

  private scheduleScore(def: ThemeDef, score: Score, step: number, t: number, stepDur: number): void {
    const g = this.themeGain!;
    const total = score.melody.reduce((n, [, d]) => n + d, 0);
    const local = step % total;
    // Drums: bass drum on 1 & 3, snare on the off-beats, a small roll at the end of each 2 bars.
    const ch = def.usul[local % def.usul.length];
    if (ch === "D") this.synth.davul(t, g, 0.32, true);
    else if (ch === "T") this.synth.davul(t, g, 0.16, false);
    if (ch === "S" || (local % 16 >= 14 && local % 2 === 1)) this.synth.snare(t, g, ch === "S" ? 0.14 : 0.1);
    if (local % 16 === 15) this.synth.snare(t + stepDur / 2, g, 0.08);
    // Bass: root on beats 1 & 3, fifth on 2 & 4.
    if (local % 2 === 0) {
      const bar = Math.floor(local / 8);
      const root = score.bassRoots[bar % score.bassRoots.length];
      this.synth.bass(t, midiHz(local % 4 === 0 ? root : root + 7), stepDur * 1.8, g, 0.16);
    }
    // Melody note starting at this step.
    let acc = 0;
    for (const [note, dur] of score.melody) {
      if (acc === local) {
        if (note > 0) this.synth.brass(t, midiHz(note), dur * stepDur * 0.92, g, 0.11);
        break;
      }
      acc += dur;
      if (acc > local) break;
    }
  }

  private scheduleStep(def: ThemeDef, step: number, t: number, stepDur: number): void {
    if (def.score) {
      this.scheduleScore(def, def.score, step, t, stepDur);
      return;
    }
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
    const freq = (def.scale ?? HICAZ_D)[this.degree];
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
