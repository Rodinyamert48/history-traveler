import type { AbstractEngine, Scene } from "@babylonjs/core";
import type { AudioManager } from "../audio/AudioManager";
import type { QualityPreset } from "../config/qualityPresets";
import type { UIManager } from "../ui/UIManager";
import type { EngineInfo } from "./EngineFactory";
import type { InputManager } from "./InputManager";
import type { SaveManager, Settings } from "./SaveManager";

/** Shared services handed to every scene (dependency injection instead of globals). */
export interface GameServices {
  engine: AbstractEngine;
  engineInfo: EngineInfo;
  canvas: HTMLCanvasElement;
  input: InputManager;
  save: SaveManager;
  audio: AudioManager;
  ui: UIManager;
  /** Effective quality preset (from the saved quality level). */
  preset(): QualityPreset;
}

export interface GameScene {
  readonly scene: Scene;
  update(dt: number): void;
  applySettings(settings: Settings, changed: (keyof Settings)[]): void;
  dispose(): void;
}
