import { Vector3 } from "@babylonjs/core";
import type { AudioManager } from "../audio/AudioManager";
import { GAME_CONFIG } from "../config/gameConfig";
import type { InputManager } from "../core/InputManager";
import type { Player } from "../entities/Player";
import type { SeaShip } from "../scenarios/samsun/SamsunWorld";
import type { HUD } from "../ui/HUD";
import type { MobileControls } from "../ui/MobileControls";
import { el, escapeHtml, setText } from "../ui/dom";
import { clamp } from "../utils/math";
import { asciiBar, BaseMinigame } from "./BaseMinigame";

const CFG = GAME_CONFIG.minigames.durbun;

export interface DurbunMinigameDeps {
  layer: HTMLElement;
  input: InputManager;
  audio: AudioManager;
  hud: HUD;
  mobile: MobileControls;
  player: Player;
  stand: Vector3;
  facing: number;
  ships: SeaShip[];
  /** Called once the harbour is logged: the Bandırma appears on the western horizon. */
  revealBandirma(): void;
}

/**
 * MINIGAME — "Dürbün Nöbeti".
 * From the lookout trench, sweep the bay through the binoculars and log every ship: keep the
 * crosshair on one and hold SPACE (or the mouse button) until it is identified. Once the
 * harbour is logged, smoke rises in the west — find and identify the Bandırma.
 */
export class DurbunMinigame extends BaseMinigame {
  private logged = new Set<string>();
  private hold = 0;
  private aimed: SeaShip | null = null;
  private revealed = false;
  private done = 0;
  private savedFov = 0.8;
  private ring!: HTMLDivElement;
  private label!: HTMLDivElement;
  private log!: HTMLDivElement;
  private card!: HTMLDivElement;
  private hint!: HTMLDivElement;
  private feedback!: HTMLDivElement;
  private bar!: HTMLDivElement;
  private ascii!: HTMLDivElement;
  private pct!: HTMLSpanElement;

  constructor(private readonly d: DurbunMinigameDeps) {
    super(d.layer);
  }

  private get harbour(): SeaShip[] {
    return this.d.ships.filter((s) => s.id !== "bandirma");
  }

  protected onStart(): void {
    const { player, mobile, hud, stand, facing } = this.d;
    player.controlEnabled = false;
    player.lookEnabled = true;
    player.position.set(stand.x, stand.y, stand.z);
    player.yaw = facing;
    // Ships lie ~10° below the horizon seen from the hilltop (positive pitch looks down).
    player.pitch = 0.16;
    player.yawLimit = { center: facing, range: 1.35 };
    player.pitchLimit = { min: -0.05, max: 0.34 };
    this.savedFov = player.camera.fov;
    player.camera.fov = CFG.fov;
    mobile.setActionButtons([
      { label: "TANI", action: "jump" },
      { label: "BIRAK", action: "action" },
    ]);
    mobile.setLayout("action");
    hud.setCrosshair(false);
    this.logged.clear();
    this.hold = 0;
    this.revealed = false;
    this.done = 0;
    this.buildUi();
  }

  private buildUi(): void {
    const u = this.ui;
    el("div", "binocular-mask", u);
    const reticle = el("div", "binocular-reticle", u);
    this.ring = el("div", "br-ring", reticle);
    this.label = el("div", "binocular-label", u);
    this.feedback = el("div", "rhythm-feedback high", u);
    this.log = el("div", "durbun-log", u);
    this.card = el("div", "durbun-card", u);
    const panel = el("div", "mg-panel compact", u);
    const row = el("div", "mg-row", panel);
    el("div", "mg-title", row, "DÜRBÜN NÖBETİ");
    this.pct = el("span", "mg-value", row, "0%");
    const bar = el("div", "mg-bar", panel);
    this.bar = el("div", "mg-bar-fill", bar);
    this.ascii = el("div", "mg-ascii", panel, asciiBar(0));
    this.hint = el("div", "hint-line", panel);
    this.renderLog();
  }

  private renderLog(): void {
    const rows = this.harbour.map((s) => `<li class="${this.logged.has(s.id) ? "ok" : ""}">${this.logged.has(s.id) ? "✓ " + escapeHtml(s.name) : "? ? ?"}</li>`);
    if (this.revealed) rows.push(`<li class="${this.logged.has("bandirma") ? "ok gold" : "wait"}">${this.logged.has("bandirma") ? "✓ Bandırma Vapuru" : "Batıdaki duman…"}</li>`);
    this.log.innerHTML = `<div class="dl-title">NÖBET DEFTERİ · 19 MAYIS 1919</div><ul>${rows.join("")}</ul>`;
    const touch = this.d.input.isTouch;
    setText(
      this.hint,
      !this.revealed
        ? touch
          ? "Ekranı sürükleyip limanı tara. Bir geminin üstünde TANI'yı basılı tut."
          : "Fareyle limanı tara. Bir geminin üstünde SPACE / sol tık basılı tut · F: bırak"
        : "Batı ufkunda bir vapur dumanı! Sola dön ve vapuru tanı.",
    );
  }

  private showFeedback(text: string, color: string): void {
    this.feedback.textContent = text;
    this.feedback.style.color = color;
    this.feedback.classList.remove("show");
    void this.feedback.offsetWidth;
    this.feedback.classList.add("show");
  }

  /** The ship nearest the centre of the view, if the crosshair is on it. */
  private shipUnderCrosshair(): SeaShip | null {
    const cam = this.d.player.camera;
    const origin = cam.globalPosition;
    const fwd = cam.getDirection(new Vector3(0, 0, 1));
    let best: SeaShip | null = null;
    let bestA = Infinity;
    for (const s of this.d.ships) {
      if (!s.node.isEnabled()) continue;
      const c = s.node.position.add(new Vector3(0, s.midY, 0));
      const to = c.subtract(origin);
      const dist = to.length();
      const ang = Math.acos(clamp(Vector3.Dot(to.normalize(), fwd), -1, 1));
      const radius = Math.atan(s.radius / dist) * 0.7 + 0.006;
      if (ang < radius && ang < bestA) {
        bestA = ang;
        best = s;
      }
    }
    return best;
  }

  protected update(dt: number): void {
    const { input, player, audio } = this.d;
    player.updateLook();
    player.syncCamera(dt, 0);
    if (this.done) {
      this.done += dt;
      if (this.done > 2.4) this.finish(true);
      return;
    }
    if (input.wasPressed("action")) {
      this.finish(false);
      return;
    }
    const ship = this.shipUnderCrosshair();
    if (ship !== this.aimed) {
      this.aimed = ship;
      this.hold = 0;
    }
    const holding = input.isDown("jump") || input.isDown("fire");
    if (ship && !this.logged.has(ship.id) && holding) {
      this.hold += dt;
      if (this.hold >= CFG.holdTime) this.identify(ship);
    } else if (!holding) this.hold = Math.max(0, this.hold - dt * 2);
    this.ring.style.setProperty("--p", `${clamp(this.hold / CFG.holdTime, 0, 1) * 360}deg`);
    this.ring.classList.toggle("on", !!ship);
    setText(this.label, ship ? (this.logged.has(ship.id) ? ship.name : "Tanımlanıyor…") : "");
    if (!ship && holding && input.wasPressed("jump")) audio.play("uiClick", { volume: 0.2, pitch: 0.7 });
    const total = this.harbour.length + 1;
    const k = this.logged.size / total;
    this.bar.style.width = `${(k * 100).toFixed(1)}%`;
    setText(this.ascii, asciiBar(k));
    setText(this.pct, `${Math.round(k * 100)}%`);
  }

  private identify(ship: SeaShip): void {
    const { audio } = this.d;
    this.logged.add(ship.id);
    this.hold = 0;
    this.card.innerHTML = `<b>${escapeHtml(ship.name)}</b><span>${escapeHtml(ship.info)}</span>`;
    this.card.classList.remove("show");
    void this.card.offsetWidth;
    this.card.classList.add("show");
    audio.play("penScratch", { volume: 0.5 });
    if (ship.id === "bandirma") {
      this.done = 0.001;
      this.showFeedback("BANDIRMA VAPURU GÖRÜNDÜ!", "#9fd26b");
      audio.play("objective", { volume: 0.9 });
    } else {
      this.showFeedback("DEFTERE YAZILDI", "#ffd36a");
      audio.play("good", { volume: 0.4 });
      if (!this.revealed && this.harbour.every((s) => this.logged.has(s.id))) {
        this.revealed = true;
        this.d.revealBandirma();
        window.setTimeout(() => this.active && this.showFeedback("BATIDA BİR DUMAN!", "#f0b54a"), 1400);
      }
    }
    this.renderLog();
  }

  protected onEnd(): void {
    const { player, mobile, hud } = this.d;
    player.camera.fov = this.savedFov;
    player.yawLimit = null;
    player.pitchLimit = null;
    player.controlEnabled = true;
    player.lookEnabled = true;
    mobile.setLayout("explore");
    hud.setCrosshair(true);
  }

  /** QA helper: where each not-yet-logged, visible ship is. */
  get qa(): { id: string; pos: Vector3 }[] {
    return this.d.ships.filter((s) => s.node.isEnabled() && !this.logged.has(s.id)).map((s) => ({ id: s.id, pos: s.node.position.add(new Vector3(0, s.midY, 0)) }));
  }
}
