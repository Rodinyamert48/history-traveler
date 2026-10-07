import type { GameScene, GameServices } from "../core/GameServices";

export interface ScenarioCreateOptions {
  onProgress(fraction: number, status: string): void;
  /** Mission to start from (resume) — undefined starts from the beginning. */
  resumeMissionId?: string;
}

export interface ScenarioInstance extends GameScene {
  /** Cinematic entry (haze → descent → FPS hand-over). */
  playIntro(): Promise<void>;
  setPaused(paused: boolean): void;
  /** Called by the scenario when the player chooses to return to the map. */
  onExitToMap: (() => void) | null;
  /** Called when the scenario wants the pause menu (e.g. pointer lock lost). */
  onRequestPause: (() => void) | null;
}

export interface ScenarioModule {
  id: string;
  cityId: string;
  missionIds: readonly string[];
  create(services: GameServices, opts: ScenarioCreateOptions): Promise<ScenarioInstance>;
}
