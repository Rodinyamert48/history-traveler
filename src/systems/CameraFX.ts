import { Vector3 } from "@babylonjs/core";
import { Noise2D } from "../utils/noise";

/** Trauma-based camera shake (smooth noise, decays over time). */
export class CameraFX {
  private trauma = 0;
  private time = 0;
  private noise = new Noise2D(9);
  readonly offset = new Vector3();

  addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(dt: number, scale = 1): Vector3 {
    this.time += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.1);
    const s = this.trauma * this.trauma * 0.35 * scale;
    const t = this.time * 22;
    this.offset.set(this.noise.noise(t, 1.3) * s, this.noise.noise(t, 7.7) * s, this.noise.noise(t, 13.1) * s);
    return this.offset;
  }
}
