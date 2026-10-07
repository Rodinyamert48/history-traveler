import { clamp } from "../utils/math";
import { MusicSequencer, type MusicTheme } from "./MusicSequencer";
import { SynthLibrary, type SfxName } from "./SynthLibrary";

export type { SfxName } from "./SynthLibrary";
export type { MusicTheme } from "./MusicSequencer";

export interface AmbienceMix {
  sea: number;
  wind: number;
  camp: number;
  battle: number;
}

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
  private ambience: Partial<Record<keyof AmbienceMix, GainNode>> = {};
  private ambienceSources: AudioScheduledSourceNode[] = [];
  private campTimer: number | null = null;
  private volumes = { master: 0.8, music: 0.5, sfx: 0.85 };
  private listener = { x: 0, y: 0, z: 0, fx: 0, fz: 1 };
  private pendingTheme: MusicTheme | null = null;
  private pendingMix: AmbienceMix | null = null;

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

  playMusic(theme: MusicTheme): void {
    this.pendingTheme = theme;
    if (!this.ctx) return;
    this.music.play(theme);
  }

  stopMusic(fade = 1.5): void {
    this.pendingTheme = null;
    this.music?.stop(fade);
  }

  /** Crossfades the looping ambience beds (0..1 each). */
  setAmbience(mix: AmbienceMix): void {
    this.pendingMix = mix;
    if (!this.ctx) return;
    const ctx = this.ctx;
    if (!this.ambience.sea) this.buildAmbience();
    const t = ctx.currentTime;
    for (const key of Object.keys(mix) as (keyof AmbienceMix)[]) {
      this.ambience[key]?.gain.setTargetAtTime(mix[key], t, 0.6);
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
    for (const key of ["sea", "wind", "camp", "battle"] as const) {
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
      this.campTimer = window.setTimeout(tick, 280 + Math.random() * 420);
    };
    tick();
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
