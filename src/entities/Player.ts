import { FreeCamera, TransformNode, Vector3, type Scene } from "@babylonjs/core";
import type { AudioManager, SfxName } from "../audio/AudioManager";
import { GAME_CONFIG } from "../config/gameConfig";
import type { InputManager } from "../core/InputManager";
import type { Settings } from "../core/SaveManager";
import type { CollisionWorld } from "../world/CollisionWorld";
import { clamp, damp, degToRad, lerp } from "../utils/math";

export type Surface = "grass" | "dirt" | "stone" | "wood";

const P = GAME_CONFIG.player;
const CAM = GAME_CONFIG.camera;

/**
 * First-person character: kinematic capsule against CollisionWorld, smoothed acceleration,
 * sprint with FOV kick, jump, head-bob / sway / landing dip, surface footsteps and an
 * attachment point for held items (cannonballs, grease bucket, the sancak).
 */
export class Player {
  readonly camera: FreeCamera;
  readonly position = new Vector3();
  readonly velocity = new Vector3();
  /** Node following the camera for first-person held items. */
  readonly hand: TransformNode;
  yaw = 0;
  pitch = 0;
  grounded = true;
  /** When false, movement input is ignored (dialogue, minigames, cinematics). */
  controlEnabled = false;
  /** When false, mouse look is ignored as well. */
  lookEnabled = false;
  /** Multiplier for movement speed (stun, carrying). */
  speedMultiplier = 1;
  isSprinting = false;
  private bobPhase = 0;
  private bobAmount = 0;
  private landDip = 0;
  private fovCurrent: number;
  private stepDistance = 0;
  private airTime = 0;
  private shakeOffset = new Vector3();
  private settings: Settings;
  /** Extra yaw/pitch limits (used while operating the cannon). */
  yawLimit: { center: number; range: number } | null = null;
  pitchLimit: { min: number; max: number } | null = null;

  constructor(
    private readonly scene: Scene,
    private world: CollisionWorld,
    private readonly input: InputManager,
    private readonly audio: AudioManager,
    settings: Settings,
    private surfaceAt: (x: number, z: number, feetY: number) => Surface,
  ) {
    this.settings = settings;
    this.camera = new FreeCamera("player-cam", new Vector3(0, 2, 0), scene);
    this.camera.minZ = CAM.nearPlane;
    this.camera.maxZ = CAM.farPlane;
    this.camera.inputs.clear();
    this.fovCurrent = degToRad(settings.fov);
    this.camera.fov = this.verticalFov(this.fovCurrent);
    this.hand = new TransformNode("player-hand", scene);
    this.hand.parent = this.camera;
    this.hand.position.set(0.32, -0.34, 0.75);
  }

  /** Settings store horizontal FOV (gamer convention); Babylon wants vertical. */
  private verticalFov(horizontal: number): number {
    const engine = this.scene.getEngine();
    const aspect = engine.getRenderWidth() / Math.max(1, engine.getRenderHeight());
    const v = 2 * Math.atan(Math.tan(horizontal / 2) / Math.max(aspect, 0.5));
    return clamp(v, 0.6, 1.6);
  }

  /** Binds the character to a (new) collision world, e.g. once the level is built. */
  bindWorld(world: CollisionWorld, surfaceAt: (x: number, z: number, feetY: number) => Surface): void {
    this.world = world;
    this.surfaceAt = surfaceAt;
  }

  applySettings(settings: Settings): void {
    this.settings = settings;
  }

  teleport(x: number, z: number, yaw?: number, pitch = 0): void {
    this.position.set(x, this.world.groundHeight(x, z, 999, 0), z);
    this.velocity.setAll(0);
    if (yaw !== undefined) this.yaw = yaw;
    this.pitch = pitch;
    this.grounded = true;
    this.syncCamera(0);
  }

  get eyePosition(): Vector3 {
    return this.camera.position;
  }

  forward(): Vector3 {
    return new Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), -Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
  }

  setShake(offset: Vector3): void {
    this.shakeOffset.copyFrom(offset);
  }

  /** Mouse/touch look only (used on its own while a minigame drives the body). */
  updateLook(): void {
    if (this.lookEnabled) {
      const look = this.input.consumeLook();
      const s = GAME_CONFIG.input.baseMouseScale * this.settings.mouseSensitivity;
      this.yaw += look.x * s;
      this.pitch += look.y * s * (this.settings.invertY ? -1 : 1);
      const maxPitch = degToRad(CAM.maxPitchDeg);
      this.pitch = clamp(this.pitch, this.pitchLimit?.min ?? -maxPitch, this.pitchLimit?.max ?? maxPitch);
      if (this.yawLimit) {
        let d = this.yaw - this.yawLimit.center;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        this.yaw = this.yawLimit.center + clamp(d, -this.yawLimit.range, this.yawLimit.range);
      }
    } else {
      this.input.consumeLook();
    }
  }

  update(dt: number): void {
    this.updateLook();

    // ------------------------------------------------------------ movement
    const axis = this.controlEnabled ? this.input.getMoveAxis() : { x: 0, y: 0 };
    const wantsSprint = this.controlEnabled && this.input.isDown("sprint") && axis.y > 0.2;
    this.isSprinting = wantsSprint && this.grounded;
    const speed = (wantsSprint ? P.sprintSpeed : P.movementSpeed) * this.speedMultiplier;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const targetX = (axis.x * cos + axis.y * sin) * speed;
    const targetZ = (-axis.x * sin + axis.y * cos) * speed;
    const accel = this.grounded ? (axis.x || axis.y ? P.acceleration : P.deceleration) : P.acceleration * P.airControl;
    const k = damp(accel, dt);
    this.velocity.x = lerp(this.velocity.x, targetX, k);
    this.velocity.z = lerp(this.velocity.z, targetZ, k);

    if (this.controlEnabled && this.grounded && this.input.wasPressed("jump")) {
      this.velocity.y = P.jumpForce;
      this.grounded = false;
      this.audio.play("jump", { volume: 0.5 });
    }
    this.velocity.y = Math.max(-P.maxFallSpeed, this.velocity.y - P.gravity * dt);

    const res = this.world.move(this.position.x, this.position.z, this.velocity.x * dt, this.velocity.z * dt, P.radius, this.position.y, P.height, P.stepHeight);
    const movedX = res.x - this.position.x;
    const movedZ = res.z - this.position.z;
    this.position.x = res.x;
    this.position.z = res.z;
    if (dt > 0) {
      // Keep velocity consistent with the actual (slid) motion so we don't stick to walls.
      this.velocity.x = movedX / dt;
      this.velocity.z = movedZ / dt;
    }

    const ground = this.world.groundHeight(this.position.x, this.position.z, this.position.y, P.stepHeight);
    const nextY = this.position.y + this.velocity.y * dt;
    if (nextY <= ground) {
      if (!this.grounded && this.airTime > 0.25) {
        const impact = clamp(-this.velocity.y / 12, 0.2, 1);
        this.landDip = CAM.landingDip * impact;
        this.audio.play("land", { volume: 0.4 + impact * 0.4 });
      }
      this.position.y = ground;
      this.velocity.y = 0;
      this.grounded = true;
      this.airTime = 0;
    } else {
      // Small ledges: snap down instead of "floating" when walking down stairs/slopes.
      if (this.grounded && this.velocity.y <= 0 && this.position.y - ground < P.stepHeight) {
        this.position.y = ground;
        this.velocity.y = 0;
      } else {
        this.position.y = nextY;
        this.grounded = false;
        this.airTime += dt;
      }
    }

    // --------------------------------------------------------- footsteps & bob
    const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.grounded && horizSpeed > 0.4) {
      this.stepDistance += horizSpeed * dt;
      const stride = P.footstepStride * (this.isSprinting ? 1.25 : 1);
      if (this.stepDistance >= stride) {
        this.stepDistance -= stride;
        const surface = this.surfaceAt(this.position.x, this.position.z, this.position.y);
        const name: SfxName = surface === "grass" ? "footstepGrass" : surface === "stone" ? "footstepStone" : surface === "wood" ? "footstepWood" : "footstepDirt";
        this.audio.play(name, { volume: this.isSprinting ? 0.8 : 0.55, pitch: 0.9 + Math.random() * 0.2 });
      }
    }
    this.syncCamera(dt, horizSpeed);
  }

  /** Positions the camera from the body state (+ procedural head motion). */
  syncCamera(dt: number, horizSpeed = 0): void {
    const bob = CAM.headBob;
    const moving = this.grounded && horizSpeed > 0.3;
    const freq = this.isSprinting ? bob.sprintFrequency : bob.walkFrequency;
    const amp = this.isSprinting ? bob.sprintAmplitude : bob.walkAmplitude;
    this.bobAmount = lerp(this.bobAmount, moving ? amp * clamp(horizSpeed / P.movementSpeed, 0, 1.4) : 0, damp(8, dt));
    if (moving) this.bobPhase += dt * freq * Math.PI * 2 * clamp(horizSpeed / P.movementSpeed, 0.6, 1.3);
    else this.bobPhase += dt * 1.2;
    this.landDip = lerp(this.landDip, 0, damp(7, dt));

    const t = performance.now() / 1000;
    const idle = CAM.idleSway * (moving ? 0 : 1);
    const bobY = Math.abs(Math.sin(this.bobPhase)) * this.bobAmount * 1.6 - this.bobAmount * 0.8;
    const bobX = Math.cos(this.bobPhase) * this.bobAmount * bob.lateralRatio;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    this.camera.position.set(
      this.position.x + bobX * cos + this.shakeOffset.x,
      this.position.y + P.eyeHeight + bobY - this.landDip + Math.sin(t * 1.3) * idle + this.shakeOffset.y,
      this.position.z - bobX * sin + this.shakeOffset.z,
    );
    this.camera.rotation.set(this.pitch + Math.sin(t * 0.9) * idle * 0.5, this.yaw, Math.cos(this.bobPhase) * degToRad(bob.rollDeg) * (this.bobAmount / bob.walkAmplitude) * 0.5);

    const targetFov = degToRad(this.settings.fov + (this.isSprinting ? CAM.sprintFovBoost : 0));
    this.fovCurrent = lerp(this.fovCurrent, targetFov, damp(6, dt));
    this.camera.fov = this.verticalFov(this.fovCurrent);

    // Held item sways gently with the bob.
    this.hand.position.set(0.32 + bobX * 0.4, -0.34 + bobY * 0.5 - this.landDip * 0.5, 0.75);
    this.audio.setListener(this.camera.position.x, this.camera.position.y, this.camera.position.z, sin, cos);
  }
}
