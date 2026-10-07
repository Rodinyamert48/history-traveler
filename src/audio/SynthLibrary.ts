export type SfxName =
  | "uiClick"
  | "uiHover"
  | "uiConfirm"
  | "uiBack"
  | "whoosh"
  | "footstepGrass"
  | "footstepDirt"
  | "footstepStone"
  | "footstepWood"
  | "jump"
  | "land"
  | "cannonFire"
  | "impactStone"
  | "debris"
  | "woodCreak"
  | "woodKnock"
  | "metalClank"
  | "drum"
  | "chant"
  | "murmur"
  | "fireCrackle"
  | "splash"
  | "arrowWhoosh"
  | "arrowHit"
  | "cheer"
  | "fanfare"
  | "objective"
  | "perfect"
  | "good"
  | "miss"
  | "distantShout"
  | "pickup"
  | "drop"
  | "stun"
  | "reload"
  | "boatOars"
  | "birdChirp"
  | "pound"
  | "woodClash"
  | "bubble"
  | "bellows"
  | "branchSnap"
  | "stir"
  | "sizzle";

/** Hicaz makam on D (Turkish classical / mehter flavour), in Hz. */
export const HICAZ_D = [293.66, 311.13, 369.99, 392.0, 440.0, 466.16, 523.25, 587.33];

/** Hüseyni on A — the typical Aegean folk / zeybek colour (segâh B approximated a bit flat). */
export const HUSEYNI_A = [220.0, 242.0, 261.63, 293.66, 329.63, 369.99, 392.0, 440.0];

/**
 * Procedural sound effects & instruments built from oscillators, filtered noise and
 * envelopes. No audio files are required; every sound has a synthesized implementation.
 */
export class SynthLibrary {
  readonly noiseBuffer: AudioBuffer;
  readonly reverb: ConvolverNode;

  /** `reverbOut` receives the wet signal of every effect/instrument played by this library. */
  constructor(
    private readonly ctx: AudioContext,
    reverbOut: AudioNode,
  ) {
    const len = ctx.sampleRate * 2;
    this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(2.4, 2.6);
    this.reverb.connect(reverbOut);
  }

  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  // ------------------------------------------------------------------ building blocks
  private gainEnv(dest: AudioNode, t: number, attack: number, hold: number, release: number, peak: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + Math.max(0.001, attack));
    g.gain.setValueAtTime(Math.max(0.0002, peak), t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
    g.connect(dest);
    return g;
  }

  private noise(t: number, dur: number, dest: AudioNode, rate = 1): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = rate;
    src.connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
    return src;
  }

  private osc(type: OscillatorType, freq: number, t: number, dur: number, dest: AudioNode): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  private filter(type: BiquadFilterType, freq: number, q: number, dest: AudioNode): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    f.connect(dest);
    return f;
  }

  private send(node: AudioNode, amount: number): void {
    const g = this.ctx.createGain();
    g.gain.value = amount;
    node.connect(g).connect(this.reverb);
  }

  // ----------------------------------------------------------------------- instruments
  pluck(t: number, freq: number, dest: AudioNode, vol = 0.3): void {
    // Ud / tanbur-like plucked string: bright attack, quick decay, slight pitch drop.
    const g = this.gainEnv(dest, t, 0.004, 0.02, 0.9, vol);
    const f = this.filter("lowpass", freq * 5, 1.2, g);
    f.frequency.setValueAtTime(freq * 8, t);
    f.frequency.exponentialRampToValueAtTime(freq * 1.5, t + 0.6);
    const o1 = this.osc("sawtooth", freq, t, 1, f);
    const o2 = this.osc("triangle", freq * 2.003, t, 1, f);
    o1.frequency.exponentialRampToValueAtTime(freq * 0.995, t + 0.5);
    o2.detune.value = 4;
    this.send(g, 0.25);
  }

  ney(t: number, freq: number, dur: number, dest: AudioNode, vol = 0.18): void {
    // Breathy end-blown reed flute: sine + air noise, delayed vibrato.
    const g = this.gainEnv(dest, t, 0.18, Math.max(0, dur - 0.4), 0.35, vol);
    const o = this.osc("sine", freq, t, dur + 0.4, g);
    const o2 = this.osc("triangle", freq * 2, t, dur + 0.4, g);
    const o2g = this.ctx.createGain();
    o2g.gain.value = 0.12;
    o2.disconnect();
    o2.connect(o2g).connect(g);
    const vib = this.ctx.createOscillator();
    vib.frequency.value = 5.2;
    const vibG = this.ctx.createGain();
    vibG.gain.setValueAtTime(0, t);
    vibG.gain.linearRampToValueAtTime(freq * 0.012, t + 0.6);
    vib.connect(vibG);
    vibG.connect(o.frequency);
    vibG.connect(o2.frequency);
    vib.start(t);
    vib.stop(t + dur + 0.5);
    const breath = this.gainEnv(dest, t, 0.1, Math.max(0, dur - 0.3), 0.3, vol * 0.18);
    this.noise(t, dur + 0.4, this.filter("bandpass", freq * 2.5, 2, breath));
    this.send(g, 0.5);
  }

  zurna(t: number, freq: number, dur: number, dest: AudioNode, vol = 0.12): void {
    // Double-reed shawm of the mehter band: nasal, buzzy, strong vibrato.
    const g = this.gainEnv(dest, t, 0.03, Math.max(0, dur - 0.1), 0.12, vol);
    const bp = this.filter("bandpass", 1400, 1.1, g);
    const lp = this.filter("lowpass", 3800, 0.7, bp);
    const o = this.osc("sawtooth", freq, t, dur + 0.15, lp);
    const o2 = this.osc("square", freq * 1.002, t, dur + 0.15, lp);
    const vib = this.ctx.createOscillator();
    vib.frequency.value = 6.3;
    const vg = this.ctx.createGain();
    vg.gain.value = freq * 0.01;
    vib.connect(vg);
    vg.connect(o.frequency);
    vg.connect(o2.frequency);
    vib.start(t);
    vib.stop(t + dur + 0.2);
    this.send(g, 0.3);
  }

  davul(t: number, dest: AudioNode, vol = 0.6, accent = true): void {
    // Large double-headed bass drum (davul): pitched thump + skin slap.
    const g = this.gainEnv(dest, t, 0.002, 0.03, accent ? 0.55 : 0.3, vol);
    const o = this.osc("sine", accent ? 95 : 120, t, 0.6, g);
    o.frequency.exponentialRampToValueAtTime(accent ? 48 : 70, t + 0.25);
    const slap = this.gainEnv(dest, t, 0.001, 0.005, 0.07, vol * (accent ? 0.5 : 0.7));
    this.noise(t, 0.1, this.filter("bandpass", accent ? 900 : 1800, 1.2, slap));
    this.send(g, 0.18);
  }

  kudum(t: number, dest: AudioNode, vol = 0.3, high = false): void {
    const g = this.gainEnv(dest, t, 0.001, 0.01, high ? 0.12 : 0.22, vol);
    const o = this.osc("triangle", high ? 420 : 210, t, 0.3, g);
    o.frequency.exponentialRampToValueAtTime(high ? 330 : 150, t + 0.12);
    const s = this.gainEnv(dest, t, 0.001, 0.003, 0.05, vol * 0.4);
    this.noise(t, 0.06, this.filter("highpass", 2400, 0.7, s));
  }

  drone(t: number, freq: number, dur: number, dest: AudioNode, vol = 0.05): void {
    const g = this.gainEnv(dest, t, 1.5, Math.max(0, dur - 3), 1.5, vol);
    const f = this.filter("lowpass", freq * 3, 0.5, g);
    this.osc("sawtooth", freq, t, dur, f);
    const o2 = this.osc("sawtooth", freq * 1.5, t, dur, f);
    o2.detune.value = 3;
    this.send(g, 0.4);
  }

  // ---------------------------------------------------------------------------- sfx
  /** Plays a named effect into `dest`; returns its approximate duration (s). */
  play(name: SfxName, dest: AudioNode, pitch = 1): number {
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.005;
    switch (name) {
      case "uiClick": {
        const g = this.gainEnv(dest, t, 0.002, 0.01, 0.06, 0.25);
        const o = this.osc("sine", 1300 * pitch, t, 0.1, g);
        o.frequency.exponentialRampToValueAtTime(700 * pitch, t + 0.06);
        return 0.1;
      }
      case "uiHover": {
        const g = this.gainEnv(dest, t, 0.002, 0.005, 0.04, 0.06);
        this.osc("sine", 2100 * pitch, t, 0.06, g);
        return 0.06;
      }
      case "uiConfirm": {
        this.pluck(t, HICAZ_D[4] * pitch, dest, 0.25);
        this.pluck(t + 0.09, HICAZ_D[7] * pitch, dest, 0.25);
        return 1;
      }
      case "uiBack": {
        this.pluck(t, HICAZ_D[4] * pitch, dest, 0.2);
        this.pluck(t + 0.08, HICAZ_D[2] * pitch, dest, 0.2);
        return 1;
      }
      case "whoosh": {
        const g = this.gainEnv(dest, t, 0.35, 0.2, 0.7, 0.5);
        const f = this.filter("bandpass", 300, 0.9, g);
        f.frequency.setValueAtTime(250, t);
        f.frequency.exponentialRampToValueAtTime(2600 * pitch, t + 0.6);
        f.frequency.exponentialRampToValueAtTime(400, t + 1.2);
        this.noise(t, 1.3, f);
        this.send(g, 0.3);
        return 1.3;
      }
      case "footstepGrass":
      case "footstepDirt":
      case "footstepStone":
      case "footstepWood": {
        const cfg = {
          footstepGrass: { f: 900, q: 0.6, type: "lowpass" as BiquadFilterType, v: 0.28, d: 0.09 },
          footstepDirt: { f: 520, q: 0.9, type: "lowpass" as BiquadFilterType, v: 0.35, d: 0.08 },
          footstepStone: { f: 1900, q: 1.4, type: "bandpass" as BiquadFilterType, v: 0.3, d: 0.05 },
          footstepWood: { f: 320, q: 3, type: "bandpass" as BiquadFilterType, v: 0.5, d: 0.07 },
        }[name];
        const g = this.gainEnv(dest, t, 0.003, 0.01, cfg.d, cfg.v);
        this.noise(t, cfg.d + 0.03, this.filter(cfg.type, cfg.f * pitch, cfg.q, g), 0.8 + Math.random() * 0.4);
        if (name === "footstepWood") {
          const k = this.gainEnv(dest, t, 0.002, 0.01, 0.1, 0.2);
          this.osc("triangle", 160 * pitch, t, 0.12, k);
        }
        return 0.15;
      }
      case "jump": {
        const g = this.gainEnv(dest, t, 0.005, 0.02, 0.1, 0.18);
        this.noise(t, 0.14, this.filter("bandpass", 700, 1, g));
        return 0.15;
      }
      case "land": {
        const g = this.gainEnv(dest, t, 0.002, 0.02, 0.18, 0.5);
        const o = this.osc("sine", 110, t, 0.25, g);
        o.frequency.exponentialRampToValueAtTime(50, t + 0.15);
        const n = this.gainEnv(dest, t, 0.002, 0.01, 0.12, 0.3);
        this.noise(t, 0.15, this.filter("lowpass", 700, 0.7, n));
        return 0.3;
      }
      case "cannonFire": {
        // Deep boom + crack + long rolling tail through the reverb.
        const boom = this.gainEnv(dest, t, 0.003, 0.05, 1.6, 1.0);
        const o = this.osc("sine", 75 * pitch, t, 1.8, boom);
        o.frequency.exponentialRampToValueAtTime(26, t + 1.2);
        const crack = this.gainEnv(dest, t, 0.001, 0.02, 0.45, 0.9);
        this.noise(t, 0.5, this.filter("lowpass", 2600, 0.5, crack));
        const rumble = this.gainEnv(dest, t + 0.05, 0.08, 0.3, 2.4, 0.55);
        this.noise(t + 0.05, 2.8, this.filter("lowpass", 240, 0.6, rumble), 0.5);
        this.send(boom, 0.6);
        this.send(rumble, 0.9);
        return 3.2;
      }
      case "impactStone": {
        const thud = this.gainEnv(dest, t, 0.002, 0.03, 0.6, 0.85);
        const o = this.osc("sine", 90 * pitch, t, 0.7, thud);
        o.frequency.exponentialRampToValueAtTime(35, t + 0.4);
        const crunch = this.gainEnv(dest, t, 0.002, 0.08, 0.5, 0.6);
        this.noise(t, 0.7, this.filter("bandpass", 1300, 0.6, crunch), 0.7);
        for (let i = 0; i < 6; i++) {
          const tt = t + 0.08 + Math.random() * 0.5;
          const g = this.gainEnv(dest, tt, 0.001, 0.004, 0.05, 0.2 * Math.random() + 0.08);
          this.noise(tt, 0.06, this.filter("bandpass", 2000 + Math.random() * 2500, 2, g));
        }
        this.send(thud, 0.5);
        return 1.2;
      }
      case "debris": {
        for (let i = 0; i < 8; i++) {
          const tt = t + Math.random() * 0.9;
          const g = this.gainEnv(dest, tt, 0.001, 0.005, 0.06, 0.12 + Math.random() * 0.1);
          this.noise(tt, 0.07, this.filter("bandpass", 900 + Math.random() * 2600, 2.2, g));
        }
        return 1;
      }
      case "woodCreak": {
        const g = this.gainEnv(dest, t, 0.08, 0.25, 0.35, 0.22);
        const f = this.filter("bandpass", 650 * pitch, 6, g);
        const o = this.osc("sawtooth", 95 * pitch, t, 0.8, f);
        o.frequency.linearRampToValueAtTime(140 * pitch, t + 0.3);
        o.frequency.linearRampToValueAtTime(85 * pitch, t + 0.65);
        return 0.8;
      }
      case "woodKnock": {
        const g = this.gainEnv(dest, t, 0.001, 0.01, 0.15, 0.45);
        const o = this.osc("triangle", 210 * pitch, t, 0.2, this.filter("bandpass", 400 * pitch, 4, g));
        o.frequency.exponentialRampToValueAtTime(150 * pitch, t + 0.1);
        return 0.2;
      }
      case "metalClank": {
        const partials = [1, 2.76, 5.4, 8.93];
        for (const [i, p] of partials.entries()) {
          const g = this.gainEnv(dest, t, 0.001, 0.005, 0.5 / (i + 1), 0.12 / (i + 1));
          this.osc("sine", 420 * p * pitch, t, 0.6, g);
        }
        return 0.6;
      }
      case "drum": {
        this.davul(t, dest, 0.75 * pitch, true);
        return 0.7;
      }
      case "chant": {
        // Crew pulling chant "Hey-ya!": two formant-filtered vocal bursts.
        this.voice(t, 150 * pitch, 0.18, dest, 0.4, [700, 1220]);
        this.voice(t + 0.22, 175 * pitch, 0.28, dest, 0.45, [800, 1150]);
        return 0.6;
      }
      case "murmur": {
        const syl = 3 + Math.floor(Math.random() * 4);
        let tt = t;
        for (let i = 0; i < syl; i++) {
          const d = 0.08 + Math.random() * 0.1;
          const vowel = [
            [700, 1100],
            [400, 1900],
            [500, 900],
            [300, 2200],
          ][Math.floor(Math.random() * 4)] as [number, number];
          this.voice(tt, (110 + Math.random() * 50) * pitch, d, dest, 0.12, vowel);
          tt += d + 0.03 + Math.random() * 0.05;
        }
        return tt - t + 0.2;
      }
      case "distantShout": {
        this.voice(t, (160 + Math.random() * 60) * pitch, 0.4 + Math.random() * 0.3, this.filter("lowpass", 1100, 0.7, dest), 0.25, [750, 1200]);
        return 1;
      }
      case "fireCrackle": {
        const n = 2 + Math.floor(Math.random() * 4);
        for (let i = 0; i < n; i++) {
          const tt = t + Math.random() * 0.25;
          const g = this.gainEnv(dest, tt, 0.0005, 0.002, 0.02, 0.05 + Math.random() * 0.08);
          this.noise(tt, 0.03, this.filter("highpass", 1800 + Math.random() * 2000, 0.8, g));
        }
        return 0.3;
      }
      case "splash": {
        const g = this.gainEnv(dest, t, 0.01, 0.1, 0.9, 0.6);
        const f = this.filter("lowpass", 3000, 0.6, g);
        f.frequency.setValueAtTime(3000, t);
        f.frequency.exponentialRampToValueAtTime(300, t + 1);
        this.noise(t, 1.1, f);
        this.send(g, 0.2);
        return 1.1;
      }
      case "boatOars": {
        for (let i = 0; i < 4; i++) {
          const tt = t + i * 0.9;
          const g = this.gainEnv(dest, tt, 0.05, 0.1, 0.5, 0.25);
          this.noise(tt, 0.7, this.filter("lowpass", 900, 0.8, g));
          this.play("woodCreak", dest, 1.2);
        }
        return 3.6;
      }
      case "arrowWhoosh": {
        const g = this.gainEnv(dest, t, 0.02, 0.05, 0.15, 0.25);
        const f = this.filter("bandpass", 1200, 3, g);
        f.frequency.setValueAtTime(2600, t);
        f.frequency.exponentialRampToValueAtTime(700, t + 0.2);
        this.noise(t, 0.25, f);
        return 0.25;
      }
      case "arrowHit": {
        const g = this.gainEnv(dest, t, 0.001, 0.01, 0.12, 0.35);
        this.osc("triangle", 260 * pitch, t, 0.15, this.filter("bandpass", 500, 3, g));
        const n = this.gainEnv(dest, t, 0.001, 0.005, 0.06, 0.2);
        this.noise(t, 0.08, this.filter("highpass", 1500, 0.7, n));
        return 0.2;
      }
      case "cheer": {
        for (let i = 0; i < 14; i++) {
          const tt = t + Math.random() * 0.4;
          this.voice(tt, 140 + Math.random() * 120, 0.8 + Math.random() * 0.7, dest, 0.08, [650 + Math.random() * 200, 1100 + Math.random() * 300]);
        }
        const crowd = this.gainEnv(dest, t, 0.2, 0.8, 1.2, 0.18);
        this.noise(t, 2.3, this.filter("bandpass", 1000, 0.5, crowd));
        this.send(crowd, 0.4);
        return 2.4;
      }
      case "fanfare": {
        const motif = [4, 5, 4, 2, 4, 7];
        motif.forEach((deg, i) => this.zurna(t + i * 0.18, HICAZ_D[deg] * pitch, i === motif.length - 1 ? 0.7 : 0.16, dest, 0.12));
        this.davul(t, dest, 0.6, true);
        this.davul(t + 0.54, dest, 0.5, false);
        this.davul(t + 0.9, dest, 0.7, true);
        return 2;
      }
      case "objective": {
        [0, 2, 4, 7].forEach((deg, i) => this.pluck(t + i * 0.08, HICAZ_D[deg] * pitch, dest, 0.22));
        this.davul(t + 0.32, dest, 0.4, true);
        return 1.4;
      }
      case "perfect": {
        this.pluck(t, HICAZ_D[7] * pitch, dest, 0.25);
        this.pluck(t + 0.05, HICAZ_D[4] * 2 * pitch, dest, 0.15);
        return 0.9;
      }
      case "good": {
        this.pluck(t, HICAZ_D[4] * pitch, dest, 0.2);
        return 0.8;
      }
      case "miss": {
        const g = this.gainEnv(dest, t, 0.005, 0.03, 0.15, 0.18);
        const o = this.osc("triangle", 180, t, 0.2, g);
        o.frequency.exponentialRampToValueAtTime(110, t + 0.15);
        return 0.2;
      }
      case "pickup": {
        this.play("woodKnock", dest, 0.8);
        const g = this.gainEnv(dest, t, 0.01, 0.05, 0.2, 0.25);
        this.noise(t, 0.25, this.filter("lowpass", 500, 0.8, g));
        return 0.3;
      }
      case "drop": {
        const g = this.gainEnv(dest, t, 0.002, 0.02, 0.3, 0.6);
        const o = this.osc("sine", 120, t, 0.35, g);
        o.frequency.exponentialRampToValueAtTime(60, t + 0.2);
        this.play("metalClank", dest, 0.5);
        return 0.4;
      }
      case "stun": {
        const g = this.gainEnv(dest, t, 0.005, 0.05, 0.4, 0.3);
        const o = this.osc("sine", 900, t, 0.5, g);
        o.frequency.exponentialRampToValueAtTime(300, t + 0.4);
        return 0.5;
      }
      case "birdChirp": {
        // A short warbled phrase: 2–4 quick sine sweeps.
        const n = 2 + Math.floor(Math.random() * 3);
        const base = (2600 + Math.random() * 1400) * pitch;
        for (let i = 0; i < n; i++) {
          const tt = t + i * (0.09 + Math.random() * 0.05);
          const g = this.gainEnv(dest, tt, 0.005, 0.03, 0.05, 0.05);
          const o = this.osc("sine", base * (1 + Math.random() * 0.25), tt, 0.1, g);
          o.frequency.exponentialRampToValueAtTime(base * (0.75 + Math.random() * 0.6), tt + 0.07);
        }
        return 0.6;
      }
      case "pound": {
        // Wooden mallet into the stone mortar full of wheat: deep thud + grain crunch.
        const g = this.gainEnv(dest, t, 0.001, 0.02, 0.28, 0.7);
        const o = this.osc("sine", 120 * pitch, t, 0.35, g);
        o.frequency.exponentialRampToValueAtTime(55 * pitch, t + 0.18);
        const c = this.gainEnv(dest, t, 0.001, 0.03, 0.16, 0.35);
        this.noise(t, 0.2, this.filter("bandpass", 1500 * pitch, 0.9, c));
        this.play("woodKnock", dest, 0.6 * pitch);
        return 0.4;
      }
      case "woodClash": {
        // Two mallets hitting each other: dry, bright clack.
        const g = this.gainEnv(dest, t, 0.0005, 0.005, 0.09, 0.6);
        const o = this.osc("square", 640 * pitch, t, 0.1, this.filter("bandpass", 1300 * pitch, 3, g));
        o.frequency.exponentialRampToValueAtTime(420 * pitch, t + 0.06);
        return 0.15;
      }
      case "bubble": {
        // Thick porridge "blop" in the cauldron.
        const g = this.gainEnv(dest, t, 0.004, 0.01, 0.08, 0.22);
        const f0 = (180 + Math.random() * 160) * pitch;
        const o = this.osc("sine", f0, t, 0.12, g);
        o.frequency.exponentialRampToValueAtTime(f0 * 2.4, t + 0.07);
        return 0.15;
      }
      case "bellows": {
        // Leather bellows (körük) puff: rising then falling filtered air.
        const g = this.gainEnv(dest, t, 0.06, 0.08, 0.25, 0.4);
        const f = this.filter("bandpass", 500 * pitch, 0.9, g);
        f.frequency.setValueAtTime(350 * pitch, t);
        f.frequency.exponentialRampToValueAtTime(900 * pitch, t + 0.12);
        f.frequency.exponentialRampToValueAtTime(300 * pitch, t + 0.4);
        this.noise(t, 0.45, f);
        return 0.45;
      }
      case "branchSnap": {
        for (let i = 0; i < 3; i++) {
          const tt = t + i * 0.025 + Math.random() * 0.02;
          const g = this.gainEnv(dest, tt, 0.0005, 0.004, 0.05, 0.35 - i * 0.08);
          this.noise(tt, 0.05, this.filter("bandpass", (1800 + Math.random() * 900) * pitch, 1.4, g));
        }
        this.play("woodKnock", dest, 1.4 * pitch);
        return 0.3;
      }
      case "stir": {
        // Paddle through thick keşkek: slow, low, wet swish.
        const g = this.gainEnv(dest, t, 0.08, 0.12, 0.25, 0.28);
        const f = this.filter("lowpass", 700 * pitch, 1.6, g);
        f.frequency.setValueAtTime(250 * pitch, t);
        f.frequency.linearRampToValueAtTime(800 * pitch, t + 0.2);
        f.frequency.linearRampToValueAtTime(300 * pitch, t + 0.45);
        this.noise(t, 0.5, f, 0.6);
        return 0.5;
      }
      case "sizzle": {
        const g = this.gainEnv(dest, t, 0.02, 0.4, 0.5, 0.25);
        this.noise(t, 1, this.filter("highpass", 3200, 0.7, g));
        return 1;
      }
      case "reload": {
        this.play("woodKnock", dest, 0.7);
        const tt = t + 0.35;
        const g = this.gainEnv(dest, tt, 0.05, 0.2, 0.2, 0.2);
        this.noise(tt, 0.5, this.filter("bandpass", 600, 1.5, g));
        return 0.8;
      }
    }
    return 0.5;
  }

  /** Very small formant voice: buzzy source through two vowel formants. */
  private voice(t: number, f0: number, dur: number, dest: AudioNode, vol: number, formants: [number, number]): void {
    const g = this.gainEnv(dest, t, 0.03, Math.max(0, dur - 0.08), 0.08, vol);
    const f1 = this.filter("bandpass", formants[0], 5, g);
    const f2 = this.filter("bandpass", formants[1], 6, g);
    const o = this.osc("sawtooth", f0, t, dur + 0.1, f1);
    o.connect(f2);
    o.frequency.linearRampToValueAtTime(f0 * (0.9 + Math.random() * 0.25), t + dur);
  }
}
