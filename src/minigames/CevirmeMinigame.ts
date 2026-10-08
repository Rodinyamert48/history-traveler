import { Color4, Vector3, type Mesh, type ParticleSystem, type PBRMaterial, type PointLight, type TransformNode } from "@babylonjs/core";
import { hexColor, mixColor } from "../assets/GeoBuilder";
import type { AudioManager } from "../audio/AudioManager";
import { GAME_CONFIG } from "../config/gameConfig";
import type { InputManager } from "../core/InputManager";
import type { Player } from "../entities/Player";
import type { ParticleFX } from "../systems/ParticleFX";
import type { HUD } from "../ui/HUD";
import type { MobileControls } from "../ui/MobileControls";
import { el, setText } from "../ui/dom";
import { clamp, lerp } from "../utils/math";
import { BaseMinigame } from "./BaseMinigame";

const CFG = GAME_CONFIG.minigames.cevirme;

export interface CevirmeMinigameDeps {
  layer: HTMLElement;
  input: InputManager;
  audio: AudioManager;
  hud: HUD;
  mobile: MobileControls;
  player: Player;
  fx: ParticleFX;
  stand: Vector3;
  facing: number;
  spit: TransformNode;
  lamb: Mesh;
  material: PBRMaterial;
  light: PointLight;
  fire: ParticleSystem;
  smoke: ParticleSystem;
}

const SIDE_NAMES = ["SIRT", "SAĞ BÖĞÜR", "KARIN", "SOL BÖĞÜR"];
const RAW = hexColor("#d8a090");
const GOLDEN = hexColor("#a8642e");
const BURNT = hexColor("#2a1a10");

function roastColor(k: number): [number, number, number] {
  const c = k <= 1 ? mixColor(RAW, GOLDEN, k) : mixColor(GOLDEN, BURNT, Math.min(1, (k - 1) / (CFG.burn - 1)));
  return [c[0], c[1], c[2]];
}

/**
 * MINIGAME — "Kuzu Çevirme".
 * A whole lamb turns on a spit over the embers. Keep the fire right with firewood (E) — too
 * cold and nothing cooks, too hot and the fat flares — and give the spit a quarter turn
 * (SPACE) so each side gets its share. When all four sides are golden, take it off (Q).
 */
export class CevirmeMinigame extends BaseMinigame {
  private heat = 0.55;
  private sides = [0, 0, 0, 0];
  /** Index of the side facing the embers, and the animated spit angle. */
  private down = 2;
  private angle = 0;
  private targetAngle = 0;
  private woodCd = 0;
  private sizzle = 0;
  private smokeT = 0;
  private endT = 0;
  private won = false;
  private feedback!: HTMLDivElement;
  private heatNeedle!: HTMLDivElement;
  private sideEls: { root: HTMLDivElement; fill: HTMLDivElement }[] = [];
  private stats!: HTMLDivElement;

  constructor(private readonly d: CevirmeMinigameDeps) {
    super(d.layer);
  }

  protected onStart(): void {
    const { player, mobile, hud, stand, facing } = this.d;
    player.controlEnabled = false;
    player.lookEnabled = false;
    player.position.set(stand.x, stand.y, stand.z);
    player.yaw = facing;
    player.pitch = 0.3;
    mobile.setActionButtons([
      { label: "ODUN AT", action: "interact" },
      { label: "ÇEVİR", action: "jump" },
      { label: "ŞİŞTEN AL", action: "aimDown" },
    ]);
    mobile.setLayout("action");
    hud.setCrosshair(false);
    this.heat = 0.55;
    this.sides = [0, 0, 0, 0];
    this.down = 2;
    this.angle = 0;
    this.targetAngle = 0;
    this.endT = 0;
    this.won = false;
    this.d.spit.rotation.x = 0;
    this.buildUi();
    this.d.audio.play("sizzle", { volume: 0.3 });
  }

  private buildUi(): void {
    const u = this.ui;
    this.feedback = el("div", "rhythm-feedback high long", u);
    const panel = el("div", "mg-panel compact cevirme-panel", u);
    const r = el("div", "mg-row", panel);
    el("div", "mg-title", r, "KUZU ÇEVİRME");
    el("div", "cv-label", panel, "ATEŞ");
    const track = el("div", "cv-heat", panel);
    const zone = el("div", "cv-heat-zone", track);
    zone.style.left = "40%";
    zone.style.width = `${(CFG.flare - 0.4) * 100}%`;
    this.heatNeedle = el("div", "cv-heat-needle", track);
    el("div", "cv-label", panel, "PİŞME (her yüz)");
    const sides = el("div", "cv-sides", panel);
    this.sideEls = SIDE_NAMES.map((n) => {
      const root = el("div", "cv-side", sides);
      el("span", "", root, n);
      const t = el("div", "cv-side-track", root);
      const good = el("div", "cv-side-good", t);
      good.style.left = `${(CFG.done[0] / CFG.burn) * 100}%`;
      good.style.width = `${((CFG.done[1] - CFG.done[0]) / CFG.burn) * 100}%`;
      const fill = el("div", "cv-side-fill", t);
      return { root, fill };
    });
    this.stats = el("div", "mg-stats", panel);
    el(
      "div",
      "hint-line",
      panel,
      this.d.input.isTouch ? "ODUN AT: ateşi canlandır · ÇEVİR: çeyrek tur · hepsi kızarınca ŞİŞTEN AL" : "E: odun at · SPACE: şişi çeyrek tur çevir · Q: hepsi kızarınca şişten al · F: bırak",
    );
  }

  private showFeedback(text: string, color: string): void {
    this.feedback.innerHTML = text;
    this.feedback.style.color = color;
    this.feedback.classList.remove("show");
    void this.feedback.offsetWidth;
    this.feedback.classList.add("show");
  }

  private allDone(): boolean {
    return this.sides.every((s) => s >= CFG.done[0] && s <= CFG.done[1]);
  }

  protected update(dt: number): void {
    const { input, player, audio, fx, spit, material, light, fire, smoke } = this.d;
    if (this.endT) {
      this.endT += dt;
      player.syncCamera(dt, 0);
      if (this.endT > 2.2) this.finish(this.won);
      return;
    }
    if (input.wasPressed("action")) {
      this.finish(false);
      return;
    }
    this.woodCd = Math.max(0, this.woodCd - dt);
    if (input.wasPressed("interact") && this.woodCd <= 0) {
      this.heat = Math.min(1.25, this.heat + CFG.woodHeat);
      this.woodCd = 0.35;
      audio.play("branchSnap", { volume: 0.5 });
      audio.play("fireCrackle", { volume: 0.5 });
      fx.dustPuff(new Vector3(spit.position.x, spit.position.y - 1, spit.position.z), 6, new Color4(1, 0.6, 0.2, 0.8));
    }
    if (input.wasPressed("jump") || input.wasPressed("fire")) {
      this.down = (this.down + 1) % 4;
      this.targetAngle += Math.PI / 2;
      audio.play("metalClank", { volume: 0.25, pitch: 1.4 });
    }
    if (input.wasPressed("aimDown")) {
      if (this.allDone()) {
        this.end(true);
        return;
      }
      const raw = this.sides.findIndex((s) => s < CFG.done[0]);
      this.showFeedback(raw >= 0 ? `${SIDE_NAMES[raw]} DAHA ÇİĞ` : "FAZLA PİŞEN YER VAR", "#f0b54a");
      audio.play("miss", { volume: 0.3 });
    }

    // Fire dies down slowly; cooking speed follows the heat, faster once the fat flares.
    this.heat = Math.max(0, this.heat - CFG.heatDecay * dt);
    const flare = this.heat > CFG.flare;
    const rate = CFG.cookRate * this.heat * (flare ? 1.8 : 1) * (this.heat < 0.25 ? 0.3 : 1);
    this.sides[this.down] += rate * dt;
    this.sides[(this.down + 1) % 4] += rate * CFG.sideShare * dt;
    this.sides[(this.down + 3) % 4] += rate * CFG.sideShare * dt;
    const burnt = this.sides.findIndex((s) => s >= CFG.burn);
    if (burnt >= 0) {
      this.showFeedback(`${SIDE_NAMES[burnt]} YANDI!<small>Kuzu kömür oldu — yeni kuzu şişe geçiyor.</small>`, "#e2655a");
      this.end(false);
      return;
    }

    // Spit turns smoothly to its new quarter.
    this.angle = lerp(this.angle, this.targetAngle, clamp(dt * 7, 0, 1));
    spit.rotation.x = this.angle;
    // The lamb browns as a whole (average of its sides), the side facing us shows a little more.
    const avg = this.sides.reduce((a, b) => a + b, 0) / 4;
    const c = roastColor(avg);
    material.albedoColor.set(c[0], c[1], c[2]);
    // Fire and light follow the heat.
    fire.emitRate = 3 + this.heat * 22;
    fire.maxSize = 0.25 + this.heat * 0.35;
    smoke.emitRate = flare ? 6 : 1 + this.heat * 1.5;
    light.intensity = 0.4 + this.heat * 1.6 + Math.sin(this.elapsed * 13) * 0.12;
    this.smokeT -= dt;
    if (flare && this.smokeT <= 0) {
      this.smokeT = 0.3;
      fx.dustPuff(spit.position.add(new Vector3(0, 0.3, 0)), 2, new Color4(0.3, 0.28, 0.26, 0.6));
    }
    this.sizzle -= dt;
    if (this.sizzle <= 0) {
      this.sizzle = 1.1;
      audio.play("sizzle", { volume: 0.1 + this.heat * 0.2 });
    }
    player.yaw = lerp(player.yaw, this.d.facing, clamp(dt * 4, 0, 1));
    player.syncCamera(dt, 0);
    this.updateUi(flare);
  }

  private end(won: boolean): void {
    this.won = won;
    this.endT = 0.001;
    const { audio } = this.d;
    if (won) {
      audio.play("objective", { volume: 0.8 });
      this.showFeedback("ÇEVİRME HAZIR!<small>Kuzu nar gibi kızardı.</small>", "#9fd26b");
    } else audio.play("fireCrackle", { volume: 0.8 });
  }

  private updateUi(flare: boolean): void {
    this.heatNeedle.style.left = `${clamp(this.heat / 1.25, 0, 1) * 100}%`;
    this.heatNeedle.classList.toggle("hot", flare);
    this.heatNeedle.classList.toggle("cold", this.heat < 0.4);
    this.sides.forEach((s, i) => {
      const e = this.sideEls[i];
      e.fill.style.width = `${clamp(s / CFG.burn, 0, 1) * 100}%`;
      const c = roastColor(s);
      e.fill.style.background = `rgb(${Math.round(Math.sqrt(c[0]) * 255)},${Math.round(Math.sqrt(c[1]) * 255)},${Math.round(Math.sqrt(c[2]) * 255)})`;
      e.root.classList.toggle("down", i === this.down);
      e.root.classList.toggle("ok", s >= CFG.done[0] && s <= CFG.done[1]);
      e.root.classList.toggle("hot", s > CFG.done[1]);
    });
    setText(this.stats, `Ateşe bakan: ${SIDE_NAMES[this.down]} · ${this.heat < 0.4 ? "Ateş sönüyor — odun at!" : flare ? "Ateş çok harlı — yağ alev alıyor!" : "Ateş kıvamında"}`);
  }

  protected onEnd(): void {
    const { player, mobile, hud, spit, fire, smoke, light } = this.d;
    player.controlEnabled = true;
    player.lookEnabled = true;
    mobile.setLayout("explore");
    hud.setCrosshair(true);
    spit.rotation.x = 0;
    fire.emitRate = 8;
    fire.maxSize = 0.4;
    smoke.emitRate = 1.2;
    light.intensity = 1.2;
  }

  /** QA helper for the test bot. */
  get qa(): { heat: number; sides: number[]; down: number; done: boolean } {
    return { heat: this.heat, sides: [...this.sides], down: this.down, done: this.allDone() };
  }
}
