import type { Vector3 } from "@babylonjs/core";
import { GAME_CONFIG } from "../config/gameConfig";
import type { GameAction } from "../core/InputManager";

export interface Interactable {
  id: string;
  /** World position of the interaction point (eye-level-ish). */
  position: Vector3;
  radius?: number;
  key: "E" | "F";
  prompt: string;
  /** Hold the key for this long (seconds) instead of a single press. */
  holdTime?: number;
  enabled: () => boolean;
  onInteract: () => void;
}

/**
 * Finds the best interactable in front of the player (distance + view angle) and drives
 * the "[E] …" prompt. Supports press and press-and-hold interactions.
 */
export class InteractionSystem {
  private items = new Map<string, Interactable>();
  private holdProgress = 0;
  private holding: Interactable | null = null;
  current: Interactable | null = null;

  add(i: Interactable): void {
    this.items.set(i.id, i);
  }

  get(id: string): Interactable | undefined {
    return this.items.get(id);
  }

  remove(id: string): void {
    this.items.delete(id);
  }

  clear(): void {
    this.items.clear();
  }

  update(
    dt: number,
    eye: Vector3,
    forward: Vector3,
    isDown: (a: GameAction) => boolean,
    wasPressed: (a: GameAction) => boolean,
  ): { key: string; text: string; hold?: number } | null {
    const maxD = GAME_CONFIG.player.interactDistance;
    let best: Interactable | null = null;
    let bestScore = -Infinity;
    for (const it of this.items.values()) {
      if (!it.enabled()) continue;
      const dx = it.position.x - eye.x;
      const dy = it.position.y - eye.y;
      const dz = it.position.z - eye.z;
      const d = Math.hypot(dx, dy, dz);
      const reach = maxD + (it.radius ?? 0);
      if (d > reach) continue;
      const dot = d > 0.001 ? (dx * forward.x + dy * forward.y + dz * forward.z) / d : 1;
      // Very close targets are always reachable, otherwise the player must roughly face them.
      if (dot < GAME_CONFIG.player.interactMinDot && d > 2.2) continue;
      const score = dot * 2 - d / reach;
      if (score > bestScore) {
        bestScore = score;
        best = it;
      }
    }
    this.current = best;
    if (!best) {
      this.holding = null;
      this.holdProgress = 0;
      return null;
    }
    const action: GameAction = best.key === "E" ? "interact" : "action";
    if (best.holdTime) {
      if (isDown(action) || (best.key === "E" && isDown("fire"))) {
        if (this.holding !== best) {
          this.holding = best;
          this.holdProgress = 0;
        }
        this.holdProgress += dt / best.holdTime;
        if (this.holdProgress >= 1) {
          this.holdProgress = 0;
          this.holding = null;
          best.onInteract();
        }
      } else {
        this.holdProgress = Math.max(0, this.holdProgress - dt * 2);
      }
      return { key: best.key, text: best.prompt, hold: this.holdProgress };
    }
    if (wasPressed(action) || (best.key === "E" && wasPressed("fire"))) best.onInteract();
    return { key: best.key, text: best.prompt };
  }
}
