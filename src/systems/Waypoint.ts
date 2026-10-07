import { Matrix, Vector3, type Camera, type Scene } from "@babylonjs/core";

/** Projects a world-space objective to the screen (with edge clamping when off-screen). */
export function projectWaypoint(
  scene: Scene,
  camera: Camera,
  target: Vector3,
): { x: number; y: number; distance: number; offscreen: boolean; angle: number } {
  const engine = scene.getEngine();
  const w = engine.getRenderWidth();
  const h = engine.getRenderHeight();
  const scale = engine.getHardwareScalingLevel();
  const vp = camera.viewport.toGlobal(w, h);
  const p = Vector3.Project(target, Matrix.Identity(), scene.getTransformMatrix(), vp);
  const cssW = w * scale;
  const cssH = h * scale;
  let x = p.x * scale;
  let y = p.y * scale;
  const toTarget = target.subtract(camera.globalPosition);
  const distance = toTarget.length();
  const behind = Vector3.Dot(toTarget, camera.getForwardRay(1).direction) < 0;
  const margin = 48;
  let offscreen = behind || x < margin || x > cssW - margin || y < margin || y > cssH - margin;
  if (behind) {
    x = cssW - x;
    y = cssH - margin;
  }
  let angle = 0;
  if (offscreen) {
    const cx = cssW / 2;
    const cy = cssH / 2;
    const dx = x - cx;
    const dy = y - cy;
    angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    const sx = (cssW / 2 - margin) / Math.max(Math.abs(dx), 1e-3);
    const sy = (cssH / 2 - margin) / Math.max(Math.abs(dy), 1e-3);
    const s = Math.min(sx, sy, 1);
    x = cx + dx * s;
    y = cy + dy * s;
    offscreen = true;
  }
  return { x, y, distance, offscreen, angle };
}
