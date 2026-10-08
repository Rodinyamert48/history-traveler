import { GAME_CONFIG, QUALITY_LEVELS, type QualityLevel } from "../config/gameConfig";
import { detectDefaultQuality } from "../config/qualityPresets";
import { clamp } from "../utils/math";
import { gameEvents } from "./GameEvents";

export type RenderApiPreference = "auto" | "webgpu" | "webgl";

export interface Settings {
  quality: QualityLevel;
  /** 0.5 – 1.0, multiplied with the preset's own resolution scale. */
  resolutionScale: number;
  shadows: boolean;
  particles: boolean;
  postProcessing: boolean;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  mouseSensitivity: number;
  fov: number;
  invertY: boolean;
  renderApi: RenderApiPreference;
  showFps: boolean;
}

export interface SaveData {
  version: 1;
  unlockedCities: string[];
  completedMissions: string[];
  completedScenarios: string[];
  /** scenarioId → mission id the player should resume from. */
  currentMission: Record<string, string>;
  settings: Settings;
}

export function defaultSettings(): Settings {
  return {
    quality: detectDefaultQuality(),
    resolutionScale: 1,
    shadows: true,
    particles: true,
    postProcessing: true,
    masterVolume: GAME_CONFIG.audio.master,
    musicVolume: GAME_CONFIG.audio.music,
    sfxVolume: GAME_CONFIG.audio.sfx,
    mouseSensitivity: GAME_CONFIG.input.mouseSensitivity,
    fov: GAME_CONFIG.camera.fov,
    invertY: false,
    renderApi: "auto",
    showFps: false,
  };
}

function defaultSave(): SaveData {
  return {
    version: 1,
    unlockedCities: ["istanbul", "mugla", "ankara", "kayseri", "samsun", "bursa"],
    completedMissions: [],
    completedScenarios: [],
    currentMission: {},
    settings: defaultSettings(),
  };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

/** Validates & repairs a parsed save object so corrupted storage never crashes the game. */
function sanitize(raw: unknown): SaveData {
  const base = defaultSave();
  if (!raw || typeof raw !== "object") return base;
  const data = raw as Partial<SaveData>;
  const s = (data.settings ?? {}) as Partial<Settings>;
  const d = base.settings;
  const num = (v: unknown, fallback: number, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) ? clamp(v, min, max) : fallback;
  const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
  const settings: Settings = {
    quality: QUALITY_LEVELS.includes(s.quality as QualityLevel) ? (s.quality as QualityLevel) : d.quality,
    resolutionScale: num(s.resolutionScale, d.resolutionScale, 0.5, 1),
    shadows: bool(s.shadows, d.shadows),
    particles: bool(s.particles, d.particles),
    postProcessing: bool(s.postProcessing, d.postProcessing),
    masterVolume: num(s.masterVolume, d.masterVolume, 0, 1),
    musicVolume: num(s.musicVolume, d.musicVolume, 0, 1),
    sfxVolume: num(s.sfxVolume, d.sfxVolume, 0, 1),
    mouseSensitivity: num(
      s.mouseSensitivity,
      d.mouseSensitivity,
      GAME_CONFIG.input.minSensitivity,
      GAME_CONFIG.input.maxSensitivity,
    ),
    fov: num(s.fov, d.fov, GAME_CONFIG.camera.minFov, GAME_CONFIG.camera.maxFov),
    invertY: bool(s.invertY, d.invertY),
    renderApi: s.renderApi === "webgpu" || s.renderApi === "webgl" ? s.renderApi : "auto",
    showFps: bool(s.showFps, d.showFps),
  };
  const unlocked = isStringArray(data.unlockedCities) ? data.unlockedCities : base.unlockedCities;
  for (const id of base.unlockedCities) if (!unlocked.includes(id)) unlocked.push(id);
  const currentMission: Record<string, string> = {};
  if (data.currentMission && typeof data.currentMission === "object") {
    for (const [k, v] of Object.entries(data.currentMission)) {
      if (typeof v === "string") currentMission[k] = v;
    }
  }
  return {
    version: 1,
    unlockedCities: unlocked,
    completedMissions: isStringArray(data.completedMissions) ? data.completedMissions : [],
    completedScenarios: isStringArray(data.completedScenarios) ? data.completedScenarios : [],
    currentMission,
    settings,
  };
}

/**
 * localStorage-backed persistence. All writes go through here; storage failures
 * (private mode, quota) are swallowed so the game keeps running with in-memory state.
 */
export class SaveManager {
  private data: SaveData;
  private storageAvailable = true;

  constructor(private readonly key = GAME_CONFIG.saveKey) {
    this.data = this.load();
  }

  get save(): Readonly<SaveData> {
    return this.data;
  }

  get settings(): Readonly<Settings> {
    return this.data.settings;
  }

  private load(): SaveData {
    try {
      const raw = localStorage.getItem(this.key);
      return raw ? sanitize(JSON.parse(raw)) : defaultSave();
    } catch (err) {
      console.warn("[SaveManager] could not read save, starting fresh", err);
      this.storageAvailable = false;
      return defaultSave();
    }
  }

  persist(): void {
    if (!this.storageAvailable) return;
    try {
      localStorage.setItem(this.key, JSON.stringify(this.data));
    } catch (err) {
      console.warn("[SaveManager] could not write save", err);
    }
  }

  updateSettings(patch: Partial<Settings>): void {
    const changed: (keyof Settings)[] = [];
    const next = { ...this.data.settings };
    for (const key of Object.keys(patch) as (keyof Settings)[]) {
      const value = patch[key];
      if (value === undefined || next[key] === value) continue;
      (next as Record<keyof Settings, unknown>)[key] = value;
      changed.push(key);
    }
    if (!changed.length) return;
    this.data.settings = sanitize({ ...this.data, settings: next }).settings;
    this.persist();
    gameEvents.emit("settings:changed", { settings: this.data.settings, changed });
  }

  isMissionCompleted(missionId: string): boolean {
    return this.data.completedMissions.includes(missionId);
  }

  completeMission(scenarioId: string, missionId: string, nextMissionId: string | null): void {
    if (!this.data.completedMissions.includes(missionId)) this.data.completedMissions.push(missionId);
    if (nextMissionId) this.data.currentMission[scenarioId] = nextMissionId;
    this.persist();
  }

  completeScenario(scenarioId: string): void {
    if (!this.data.completedScenarios.includes(scenarioId)) this.data.completedScenarios.push(scenarioId);
    delete this.data.currentMission[scenarioId];
    this.persist();
  }

  unlockCity(cityId: string): void {
    if (!this.data.unlockedCities.includes(cityId)) {
      this.data.unlockedCities.push(cityId);
      this.persist();
    }
  }

  getResumeMission(scenarioId: string): string | undefined {
    return this.data.currentMission[scenarioId];
  }

  /** Clears scenario progress (used by "Yeni Oyun"). Settings are kept. */
  resetScenario(scenarioId: string, missionIds: string[]): void {
    delete this.data.currentMission[scenarioId];
    this.data.completedMissions = this.data.completedMissions.filter((id) => !missionIds.includes(id));
    this.data.completedScenarios = this.data.completedScenarios.filter((id) => id !== scenarioId);
    this.persist();
  }
}
