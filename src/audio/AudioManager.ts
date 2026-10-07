import { clamp } from "../utils/math";
import { MusicSequencer, type MusicTheme } from "./MusicSequencer";
import { SynthLibrary, type SfxName } from "./SynthLibrary";

export type { SfxName } from "./SynthLibrary";
export type { MusicTheme } from "./MusicSequencer";

export const AMBIENCE_BEDS = ["sea", "wind", "camp", "battle", "forest"] as const;
export type AmbienceBed = (typeof AMBIENCE_BEDS)[number];
/** Target level (0..1) per ambience bed; beds left out fade to silence. */
export type AmbienceMix = Partial<Record<AmbienceBed, number>>;

export interface PlayOptions {
  volume?: number;
  pitch?: number;
  pan?: number;
  /** World position for distance attenuation + stereo panning. */
  at?: { x: number; y: number; z: number };
  /** Distance at which the sound is at half volume. */
  refDistance?: number;
}

/**
 * Optional recorded samples. Every name maps to `null` by default and the game uses its
 * procedural synthesizer instead; drop an .ogg/.mp3 into public/assets/audio/ and set the
 * path here to replace a synthesized sound with a recording — no other code change needed.
 */
export const AUDIO_SAMPLE_MANIFEST: Partial<Record<SfxName, string | null>> = {
  cannonFire: null,
  impactStone: null,
  footstepGrass: null,
};

/**
 * Optional recorded music per theme (looped). `null` → the generative/arranged synth music.
 * E.g. put an instrumental recording you have the rights to at
 * public/assets/audio/dag-basini-duman-almis.mp3 and set `ankara` to "assets/audio/dag-basini-duman-almis.mp3".
 */
export const MUSIC_SAMPLE_MANIFEST: Partial<Record<MusicTheme, string | null>> = {
  ankara: null,
};

/**
 * Modular WebAudio sound system: master → (music | sfx | ambience) buses, procedural SFX
 * (SynthLibrary), a generative makam-inspired music sequencer and layered ambience beds.
 * The AudioContext is created lazily on the first user gesture (browser autoplay policy).
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private ambienceBus!: GainNode;
  private synth!: SynthLibrary;
  private music!: MusicSequencer;
  private samples = new Map<SfxName, AudioBuffer>();
  private ambience: Partial<Record<AmbienceBed, GainNode>> = {};
  private ambienceSources: AudioScheduledSourceNode[] = [];
  private campTimer: number | null = null;
  private volumes = { master: 0.8, music: 0.5, sfx: 0.85 };
  private listener = { x: 0, y: 0, z: 0, fx: 0, fz: 1 };
  private pendingTheme: MusicTheme | null = null;
  private pendingMix: AmbienceMix | null = null;
  private musicSamples = new Map<MusicTheme, AudioBuffer>();
  private musicSource: { theme: MusicTheme; src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private tone: { osc: OscillatorNode; gain: GainNode } | null = null;

  get isReady(): boolean {
    return !!this.ctx && this.ctx.state === "running";
  }

  /** Must be called from a user gesture handler. Safe to call repeatedly. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      try {
        this.ctx = new Ctor({ latencyHint: "interactive" });
      } catch (err) {
        console.warn("[Audio] AudioContext unavailable", err);
        return;
      }
      this.build();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  private build(): void {
    const ctx = this.ctx!;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    this.master = ctx.createGain();
    this.master.connect(comp).connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.ambienceBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.ambienceBus.connect(this.master);
    this.synth = new SynthLibrary(ctx, this.sfxBus);
    this.music = new MusicSequencer(ctx, this.musicBus, new SynthLibrary(ctx, this.musicBus));
    this.applyVolumes();
    for (const [name, path] of Object.entries(AUDIO_SAMPLE_MANIFEST)) {
      if (path) void this.loadSample(name as SfxName, path);
    }
    for (const [theme, path] of Object.entries(MUSIC_SAMPLE_MANIFEST)) {
      if (path) void this.loadMusicSample(theme as MusicTheme, path);
    }
    if (this.pendingTheme) this.playMusic(this.pendingTheme);
    if (this.pendingMix) this.setAmbience(this.pendingMix);
  }

  private async loadSample(name: SfxName, path: string): Promise<void> {
    if (!this.ctx) return;
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}${path}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
      this.samples.set(name, buf);
    } catch (err) {
      console.warn(`[Audio] sample "${name}" failed to load, using synthesized fallback`, err);
    }
  }

  setVolumes(master: number, music: number, sfx: number): void {
    this.volumes = { master, music, sfx };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.volumes.music * 0.55, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.volumes.sfx, t, 0.05);
    this.ambienceBus.gain.setTargetAtTime(this.volumes.sfx * 0.7, t, 0.05);
  }

  setListener(x: number, y: number, z: number, forwardX: number, forwardZ: number): void {
    const l = this.listener;
    l.x = x;
    l.y = y;
    l.z = z;
    const len = Math.hypot(forwardX, forwardZ) || 1;
    l.fx = forwardX / len;
    l.fz = forwardZ / len;
  }

  play(name: SfxName, opts: PlayOptions = {}): void {
    if (!this.ctx || this.ctx.state !== "running") return;
    let volume = opts.volume ?? 1;
    let pan = opts.pan ?? 0;
    if (opts.at) {
      const l = this.listener;
      const dx = opts.at.x - l.x;
      const dz = opts.at.z - l.z;
      const dist = Math.hypot(dx, opts.at.y - l.y, dz);
      const ref = opts.refDistance ?? 12;
      volume *= ref / (ref + Math.max(0, dist - 1));
      if (volume < 0.015) return;
      // right vector = (fz, -fx) in Babylon's left-handed XZ plane
      const rx = l.fz;
      const rz = -l.fx;
      pan = clamp(((dx * rx + dz * rz) / Math.max(dist, 0.001)) * 0.85, -1, 1);
    }
    const out = this.ctx.createGain();
    out.gain.value = volume;
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = pan;
    out.connect(panner).connect(this.sfxBus);
    const sample = this.samples.get(name);
    if (sample) {
      const src = this.ctx.createBufferSource();
      src.buffer = sample;
      src.playbackRate.value = opts.pitch ?? 1;
      src.connect(out);
      src.start();
      src.onended = () => panner.disconnect();
      return;
    }
    const duration = this.synth.play(name, out, opts.pitch ?? 1);
    window.setTimeout(() => panner.disconnect(), (duration + 0.5) * 1000);
  }

  private async loadMusicSample(theme: MusicTheme, path: string): Promise<void> {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}${path}`);
      if (!res.ok) throw new Error(`${res.status}`);
      this.musicSamples.set(theme, await this.ctx!.decodeAudioData(await res.arrayBuffer()));
      // If that theme is already playing on the synth, switch to the recording.
      if (this.pendingTheme === theme) {
        this.music.stop(1.5);
        this.startMusicSample(theme);
      }
    } catch (err) {
      console.warn(`[Audio] music "${path}" unavailable, using the synthesized arrangement`, err);
    }
  }

  private startMusicSample(theme: MusicTheme): boolean {
    const buffer = this.musicSamples.get(theme);
    if (!buffer || !this.ctx) return false;
    if (this.musicSource?.theme === theme) return true;
    this.stopMusicSample(1.5);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.8, this.ctx.currentTime + 2);
    src.connect(gain).connect(this.musicBus);
    src.start();
    this.musicSource = { theme, src, gain };
    return true;
  }

  private stopMusicSample(fade: number): void {
    const m = this.musicSource;
    if (!m || !this.ctx) return;
    const t = this.ctx.currentTime;
    m.gain.gain.cancelScheduledValues(t);
    m.gain.gain.setValueAtTime(Math.max(0.0001, m.gain.gain.value), t);
    m.gain.gain.exponentialRampToValueAtTime(0.0001, t + fade);
    m.src.stop(t + fade + 0.1);
    this.musicSource = null;
  }

  playMusic(theme: MusicTheme): void {
    this.pendingTheme = theme;
    if (!this.ctx) return;
    if (this.startMusicSample(theme)) {
      this.music.stop(1.5);
      return;
    }
    this.stopMusicSample(1.5);
    this.music.play(theme);
  }

  stopMusic(fade = 1.5): void {
    this.pendingTheme = null;
    this.music?.stop(fade);
    this.stopMusicSample(fade);
  }

  /** Continuous sidetone (e.g. a telegraph key held down). */
  setTone(on: boolean, freq = 720): void {
    if (!this.ctx || this.ctx.state !== "running") return;
    const t = this.ctx.currentTime;
    if (on && !this.tone) {
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.12, t + 0.008);
      osc.connect(gain).connect(this.sfxBus);
      osc.start();
      this.tone = { osc, gain };
    } else if (!on && this.tone) {
      const { osc, gain } = this.tone;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.01);
      osc.stop(t + 0.03);
      this.tone = null;
    }
  }

  /** Crossfades the looping ambience beds (0..1 each). */
  setAmbience(mix: AmbienceMix): void {
    this.pendingMix = mix;
    if (!this.ctx) return;
    const ctx = this.ctx;
    if (!this.ambience.sea) this.buildAmbience();
    const t = ctx.currentTime;
    for (const key of AMBIENCE_BEDS) {
      this.ambience[key]?.gain.setTargetAtTime(mix[key] ?? 0, t, 0.6);
    }
  }

  private buildAmbience(): void {
    const ctx = this.ctx!;
    const noise = this.synth.noiseBuffer;
    const makeLoop = (filterType: BiquadFilterType, freq: number, q: number, lfoRate: number, lfoDepth: number, gain: GainNode) => {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      src.playbackRate.value = 0.5 + Math.random() * 0.1;
      const f = ctx.createBiquadFilter();
      f.type = filterType;
      f.frequency.value = freq;
      f.Q.value = q;
      const amp = ctx.createGain();
      amp.gain.value = 0.6;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = lfoRate;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = lfoDepth;
      lfo.connect(lfoGain).connect(amp.gain);
      src.connect(f).connect(amp).connect(gain);
      src.start();
      lfo.start();
      this.ambienceSources.push(src, lfo);
    };
    for (const key of AMBIENCE_BEDS) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.ambienceBus);
      this.ambience[key] = g;
    }
    // Sea: low rolling surf (two detuned layers with slow swell).
    makeLoop("lowpass", 420, 0.6, 0.11, 0.45, this.ambience.sea!);
    makeLoop("bandpass", 900, 0.4, 0.07, 0.3, this.ambience.sea!);
    // Wind: band-limited hiss with gusts.
    makeLoop("bandpass", 520, 1.4, 0.05, 0.4, this.ambience.wind!);
    // Distant battle rumble.
    makeLoop("lowpass", 160, 0.8, 0.3, 0.5, this.ambience.battle!);
    // Cicadas (ağustos böceği): narrow high band of noise, fast pulsing, slow swells.
    this.buildCicadas(this.ambience.forest!);
    makeLoop("bandpass", 380, 1.1, 0.04, 0.3, this.ambience.forest!);
    // Camp: crackling fire + murmuring voices, scheduled randomly.
    const tick = () => {
      const level = this.ambience.camp?.gain.value ?? 0;
      if (level > 0.02 && this.ctx?.state === "running") {
        if (Math.random() < 0.7) this.synth.play("fireCrackle", this.ambience.camp!, 0.8 + Math.random() * 0.5);
        if (Math.random() < 0.25) this.synth.play("murmur", this.ambience.camp!, 0.8 + Math.random() * 0.4);
        if (Math.random() < 0.05) this.synth.play("metalClank", this.ambience.camp!, 0.6 + Math.random() * 0.3);
      }
      const battle = this.ambience.battle?.gain.value ?? 0;
      if (battle > 0.05 && Math.random() < 0.18) this.synth.play("distantShout", this.ambience.battle!, 0.8 + Math.random() * 0.4);
      // Pine forest: Aegean cicadas in waves and the odd bird.
      const forest = this.ambience.forest?.gain.value ?? 0;
      if (forest > 0.02 && this.ctx?.state === "running") {
        if (Math.random() < 0.09) this.synth.play("birdChirp", this.ambience.forest!, 0.85 + Math.random() * 0.4);
      }
      this.campTimer = window.setTimeout(tick, 280 + Math.random() * 420);
    };
    tick();
  }

  private buildCicadas(out: GainNode): void {
    const ctx = this.ctx!;
    for (const [freq, rate, swell] of [
      [4600, 38, 0.05],
      [5400, 44, 0.032],
    ] as const) {
      const src = ctx.createBufferSource();
      src.buffer = this.synth.noiseBuffer;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = freq;
      bp.Q.value = 9;
      const pulse = ctx.createGain();
      pulse.gain.value = 0.35;
      const lfo = ctx.createOscillator();
      lfo.type = "square";
      lfo.frequency.value = rate;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.3;
      lfo.connect(lfoGain).connect(pulse.gain);
      const level = ctx.createGain();
      level.gain.value = 0.22;
      const slow = ctx.createOscillator();
      slow.frequency.value = swell;
      const slowGain = ctx.createGain();
      slowGain.gain.value = 0.18;
      slow.connect(slowGain).connect(level.gain);
      src.connect(bp).connect(pulse).connect(level).connect(out);
      src.start();
      lfo.start();
      slow.start();
      this.ambienceSources.push(src, lfo, slow);
    }
  }

  dispose(): void {
    if (this.campTimer) window.clearTimeout(this.campTimer);
    for (const s of this.ambienceSources) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    void this.ctx?.close();
    this.ctx = null;
  }
}
