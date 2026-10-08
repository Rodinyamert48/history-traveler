import type { Vector3 } from "@babylonjs/core";
import { el } from "../ui/dom";

/**
 * Lifecycle shared by all minigames:
 *   run() → onStart() → update(dt) every frame → finish(success) → onEnd() → promise resolves.
 * Each minigame owns a DOM layer inside the HUD for its specific UI.
 */
export abstract class BaseMinigame {
  protected ui!: HTMLDivElement;
  private resolveFn: ((ok: boolean) => void) | null = null;
  private _active = false;
  paused = false;
  protected elapsed = 0;
  /**
   * Free-roam minigames (siege, gathering) move the player themselves and own the HUD
   * objective/waypoint; the hosting scene then asks them via objectiveText()/waypoint().
   */
  readonly freeRoam: boolean = false;
  /** Minigames played with a visible mouse cursor (2D maps): no pointer lock, no pause on unlock. */
  readonly freeCursor: boolean = false;

  constructor(protected readonly layer: HTMLElement) {}

  get active(): boolean {
    return this._active;
  }

  run(): Promise<boolean> {
    if (this._active) return Promise.resolve(false);
    this._active = true;
    this.elapsed = 0;
    this.ui = el("div", "minigame-ui", this.layer);
    this.onStart();
    return new Promise((resolve) => (this.resolveFn = resolve));
  }

  tick(dt: number): void {
    if (!this._active || this.paused) return;
    this.elapsed += dt;
    this.update(dt);
  }

  protected finish(success: boolean): void {
    if (!this._active) return;
    this._active = false;
    this.onEnd(success);
    this.ui.remove();
    const r = this.resolveFn;
    this.resolveFn = null;
    r?.(success);
  }

  /** Forces the minigame to end (e.g. leaving the scenario). */
  abort(): void {
    this.finish(false);
  }

  /** HUD objective while a free-roam minigame runs (null keeps whatever the game set). */
  objectiveText(): string | null {
    return null;
  }

  /** HUD waypoint while a free-roam minigame runs. */
  waypoint(): Vector3 | null {
    return null;
  }

  protected abstract onStart(): void;
  protected abstract update(dt: number): void;
  protected abstract onEnd(success: boolean): void;
}

/** Shared UI helper: progress bar + "████████░░ 80%" text. */
export function asciiBar(fraction: number, cells = 10): string {
  const f = Math.max(0, Math.min(1, fraction));
  const full = Math.round(f * cells);
  return `${"█".repeat(full)}${"░".repeat(cells - full)} ${Math.round(f * 100)}%`;
}
