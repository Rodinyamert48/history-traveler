import type { AudioManager } from "../audio/AudioManager";
import { GAME_CONFIG } from "../config/gameConfig";
import type { InputManager } from "../core/InputManager";
import type { Player } from "../entities/Player";
import type { HUD } from "../ui/HUD";
import type { MobileControls } from "../ui/MobileControls";
import { el } from "../ui/dom";
import { clamp } from "../utils/math";
import { Random } from "../utils/random";
import { BaseMinigame } from "./BaseMinigame";

const CFG = GAME_CONFIG.minigames.nusret;

export interface NusretMinigameDeps {
  layer: HTMLElement;
  input: InputManager;
  audio: AudioManager;
  hud: HUD;
  mobile: MobileControls;
  player: Player;
}

const W = 320;
const H = 180;
const LANE_Y0 = 34;
const LANE_Y1 = 160;
const MAX_SPEED = 17;
const TIME = 170;

/** Asian shore of Erenköy Bay (x of the water's edge) for a given y. */
function coastX(y: number): number {
  return 248 + 34 * Math.exp(-(((y - 104) / 44) ** 2)) + Math.sin(y * 0.11) * 2;
}

/** The mine line runs parallel to the shore, a little way off it. */
function laneX(y: number): number {
  return coastX(y) - 22;
}

const PAL = {
  sea: "#0c1a2e",
  seaHi: "#13263e",
  land: "#1a2214",
  landHi: "#24301c",
  coast: "#3a3a2a",
  moon: "#d8dcc8",
  light: "#ffd060",
  beam: "rgba(255,240,170,0.22)",
  ship: "#6a7078",
  nusret: "#a8a090",
  mine: "#8a8c94",
  mineHi: "#d8dce4",
  lane: "rgba(150,200,255,0.35)",
  text: "#c8d0d8",
};

interface Destroyer {
  x: number;
  y: number;
  vx: number;
  angle: number;
  sweep: number;
  speed: number;
}

/**
 * MINIGAME — "Nusret'in Gecesi" (2D, the night of 7–8 March 1915).
 * Steer the small minelayer Nusret through the dark into Erenköy Bay, lights out, and lay the
 * mines one by one along the line parallel to the shore — where the enemy ships turn as they
 * fire. British destroyers sweep the water with searchlights: stay out of the beams. When all
 * the mines are down, slip back north to Çanakkale before dawn.
 */
export class NusretMinigame extends BaseMinigame {
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private bg!: HTMLCanvasElement;
  private banner!: HTMLDivElement;
  private status!: HTMLDivElement;
  private x = 200;
  private y = 8;
  private heading = Math.PI;
  private speed = 0;
  private mines: { x: number; y: number }[] = [];
  private wake: { x: number; y: number; life: number }[] = [];
  private destroyers: Destroyer[] = [];
  private exposure = 0;
  private dropCd = 0;
  private phase: "lay" | "return" | "won" | "lost" = "lay";
  private endT = 0;
  private time = TIME;

  constructor(private readonly d: NusretMinigameDeps) {
    super(d.layer);
  }

  protected onStart(): void {
    const { player, mobile, hud, audio } = this.d;
    player.controlEnabled = false;
    player.lookEnabled = false;
    mobile.setActionButtons([
      { label: "◀", action: "left" },
      { label: "▲ HIZ", action: "forward" },
      { label: "▼ YAVAŞ", action: "back" },
      { label: "▶", action: "right" },
      { label: "MAYIN", action: "jump" },
    ]);
    mobile.setLayout("action");
    hud.setCrosshair(false);
    this.x = 196;
    this.y = 8;
    this.heading = Math.PI;
    this.speed = 6;
    this.mines = [];
    this.wake = [];
    this.exposure = 0;
    this.phase = "lay";
    this.endT = 0;
    this.time = TIME;
    this.destroyers = [
      { x: 70, y: 168, vx: 9, angle: 0.75, sweep: 0, speed: 0.55 },
      { x: 150, y: 176, vx: -7, angle: 0.35, sweep: 2, speed: 0.42 },
    ];
    this.buildUi();
    this.showBanner("8 MART 1915 · GECE<small>Nusret ışıklarını söndürdü. Erenköy Koyu'na 26 mayın döşenecek.</small>", 3.4);
    audio.playMusic("tension");
  }

  private buildUi(): void {
    const wrap = el("div", "pixel-duel nusret", this.ui);
    this.canvas = el("canvas", "pd-canvas", wrap);
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext("2d")!;
    this.ctx.imageSmoothingEnabled = false;
    this.banner = el("div", "pd-banner", wrap);
    this.status = el("div", "nu-status", wrap);
    el(
      "div",
      "pd-help",
      wrap,
      this.d.input.isTouch
        ? "◀ ▶ dümen · ▲▼ hız · MAYIN: kesik çizginin üstündeyken bırak · ışıldaklardan uzak dur"
        : "A/D dümen · W/S hız · SPACE: kesik çizginin üstündeyken mayın bırak · ışıldak hüzmelerinden uzak dur · F: bırak",
    );
    this.bg = this.paintBackground();
  }

  private showBanner(html: string, seconds: number): void {
    this.banner.innerHTML = html;
    this.banner.classList.remove("show");
    void this.banner.offsetWidth;
    this.banner.classList.add("show");
    window.setTimeout(() => this.banner.classList.remove("show"), seconds * 1000);
  }

  private paintBackground(): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d")!;
    const rnd = new Random(8);
    g.fillStyle = PAL.sea;
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = rnd.next() < 0.5 ? PAL.seaHi : "#0a1626";
      g.fillRect(rnd.int(0, W), rnd.int(0, H), 2, 1);
    }
    // Moonlight on the water.
    for (let i = 0; i < 60; i++) {
      g.fillStyle = "rgba(216,220,200,0.35)";
      g.fillRect(100 + rnd.range(-18, 18) * (i / 60), 12 + i * 2.4, rnd.int(2, 6), 1);
    }
    // The Asian shore with Erenköy village and a few lights.
    for (let y = 0; y < H; y++) {
      const x0 = Math.round(coastX(y));
      g.fillStyle = PAL.coast;
      g.fillRect(x0, y, 2, 1);
      g.fillStyle = PAL.land;
      g.fillRect(x0 + 2, y, W - x0, 1);
    }
    for (let i = 0; i < 300; i++) {
      const y = rnd.int(0, H);
      const x = rnd.int(Math.round(coastX(y)) + 3, W);
      g.fillStyle = PAL.landHi;
      g.fillRect(x, y, 2, 2);
    }
    // The European shore to the far left (Gallipoli), dim.
    for (let y = 0; y < H; y++) {
      const x1 = 14 + Math.sin(y * 0.05) * 4 - Math.max(0, y - 120) * 0.12;
      g.fillStyle = PAL.land;
      g.fillRect(0, y, x1, 1);
    }
    g.font = "bold 6px monospace";
    g.fillStyle = PAL.text;
    g.textAlign = "center";
    g.fillText("ERENKÖY", 296, 98);
    g.fillText("ANADOLU", 300, 30);
    g.fillText("ÇANAKKALE ↑", 200, 6);
    g.save();
    g.translate(7, 70);
    g.rotate(-Math.PI / 2);
    g.fillText("GELİBOLU", 0, 0);
    g.restore();
    return c;
  }

  // =================================================================== update
  protected update(dt: number): void {
    dt = Math.min(dt, 1 / 20);
    const { input, audio } = this.d;
    if (this.phase === "won" || this.phase === "lost") {
      this.endT += dt;
      this.stepWorld(dt);
      this.render();
      if (this.endT > 3.2) this.finish(this.phase === "won");
      return;
    }
    if (input.wasPressed("action")) {
      this.finish(false);
      return;
    }
    this.time -= dt;
    // Helm and engine.
    if (input.isDown("left")) this.heading -= 1.7 * dt;
    if (input.isDown("right")) this.heading += 1.7 * dt;
    if (input.isDown("forward")) this.speed = Math.min(MAX_SPEED, this.speed + 10 * dt);
    if (input.isDown("back")) this.speed = Math.max(0, this.speed - 12 * dt);
    this.x += Math.sin(this.heading) * this.speed * dt;
    this.y -= Math.cos(this.heading) * this.speed * dt;
    // Keep off the shores and inside the map.
    const cx = coastX(this.y) - 4;
    if (this.x > cx) {
      this.x = cx;
      this.speed *= 0.5;
    }
    this.x = clamp(this.x, 22, W - 4);
    this.y = clamp(this.y, 2, H - 4);
    this.wake.push({ x: this.x - Math.sin(this.heading) * 4, y: this.y + Math.cos(this.heading) * 4, life: 1.6 });
    // Mines.
    this.dropCd = Math.max(0, this.dropCd - dt);
    if ((input.wasPressed("jump") || input.wasPressed("fire")) && this.phase === "lay" && this.dropCd <= 0) this.drop();
    this.stepWorld(dt);
    // Searchlights.
    let lit = false;
    for (const dd of this.destroyers) if (this.inBeam(dd, this.x, this.y)) lit = true;
    this.exposure = clamp(this.exposure + (lit ? dt : -0.5 * dt), 0, CFG.spotTime);
    if (lit && Math.random() < dt * 3) audio.play("keyClick", { volume: 0.2, pitch: 0.5 });
    if (this.exposure >= CFG.spotTime) this.lose("NUSRET FARK EDİLDİ!<small>Işıldak üstümüzde — geri çekil, yeniden dene.</small>");
    else if (this.time <= 0) this.lose("ŞAFAK SÖKÜYOR<small>Görev gün ağarmadan bitmeliydi — yeniden dene.</small>");
    if (this.phase === "return" && this.y < 6) {
      this.phase = "won";
      this.endT = 0.001;
      audio.play("objective", { volume: 0.8 });
      this.showBanner("GÖREV TAMAM<small>26 mayın Erenköy Koyu'nda, kimse fark etmedi.</small>", 3.2);
    }
    this.render();
  }

  private drop(): void {
    const { audio } = this.d;
    this.dropCd = 0.3;
    const onLane = this.y >= LANE_Y0 && this.y <= LANE_Y1 && Math.abs(this.x - laneX(this.y)) <= 5;
    const spaced = this.mines.every((m) => Math.hypot(m.x - this.x, m.y - this.y) >= 3.6);
    if (!onLane) {
      this.showBanner("HATTIN DIŞINDA<small>Mayınlar kesik çizgi boyunca döşenmeli.</small>", 1);
      audio.play("miss", { volume: 0.3 });
      return;
    }
    if (!spaced) {
      this.showBanner("ÇOK SIK<small>Biraz ilerle.</small>", 0.8);
      return;
    }
    this.mines.push({ x: this.x, y: this.y });
    audio.play("splash", { volume: 0.35, pitch: 1.3 });
    if (this.mines.length >= CFG.mines) {
      this.phase = "return";
      audio.play("good", { volume: 0.6 });
      this.showBanner("26 MAYIN DÖŞENDİ<small>Şimdi sessizce kuzeye, Çanakkale'ye dön.</small>", 2.6);
    }
  }

  private lose(html: string): void {
    this.phase = "lost";
    this.endT = 0.001;
    this.d.audio.play("miss", { volume: 0.8 });
    this.showBanner(html, 3);
  }

  private stepWorld(dt: number): void {
    for (const dd of this.destroyers) {
      dd.x += dd.vx * dt;
      if (dd.x < 40 || dd.x > 190) dd.vx = -dd.vx;
      dd.sweep += dd.speed * dt;
    }
    this.wake = this.wake.filter((w) => (w.life -= dt) > 0);
  }

  private beamAngle(dd: Destroyer): number {
    return dd.angle + Math.sin(dd.sweep) * 0.75;
  }

  private inBeam(dd: Destroyer, x: number, y: number): boolean {
    const dx = x - dd.x;
    const dy = y - dd.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 150) return false;
    const a = Math.atan2(dx, -dy);
    let da = a - this.beamAngle(dd);
    da = Math.atan2(Math.sin(da), Math.cos(da));
    return Math.abs(da) < 0.085;
  }

  // =================================================================== drawing
  private render(): void {
    const g = this.ctx;
    const r = (x: number, y: number, w: number, h: number, c: string) => {
      g.fillStyle = c;
      g.fillRect(Math.round(x), Math.round(y), w, h);
    };
    g.drawImage(this.bg, 0, 0);
    // The mine line.
    if (this.phase === "lay")
      for (let y = LANE_Y0; y <= LANE_Y1; y += 4) {
        r(laneX(y), y, 1, 2, PAL.lane);
      }
    // Laid mines.
    for (const m of this.mines) {
      r(m.x - 1, m.y - 1, 3, 3, PAL.mine);
      r(m.x - 2, m.y, 5, 1, PAL.mine);
      r(m.x, m.y - 2, 1, 5, PAL.mine);
      r(m.x - 1, m.y - 1, 1, 1, PAL.mineHi);
    }
    // Wake.
    for (const w of this.wake) r(w.x, w.y, 1, 1, `rgba(200,220,240,${(w.life / 1.6) * 0.5})`);
    // Searchlight beams and the destroyers.
    for (const dd of this.destroyers) {
      const a = this.beamAngle(dd);
      g.fillStyle = PAL.beam;
      g.beginPath();
      g.moveTo(dd.x, dd.y);
      g.lineTo(dd.x + Math.sin(a - 0.085) * 150, dd.y - Math.cos(a - 0.085) * 150);
      g.lineTo(dd.x + Math.sin(a + 0.085) * 150, dd.y - Math.cos(a + 0.085) * 150);
      g.closePath();
      g.fill();
      r(dd.x - 6, dd.y - 1, 12, 3, PAL.ship);
      r(dd.x - 1, dd.y - 3, 3, 2, PAL.ship);
      r(dd.x, dd.y - 2, 1, 1, PAL.light);
    }
    // Nusret.
    g.save();
    g.translate(this.x, this.y);
    g.rotate(this.heading);
    g.fillStyle = PAL.nusret;
    g.fillRect(-1.5, -5, 3, 9);
    g.fillRect(-1, -6, 2, 1);
    g.fillStyle = "#3a3a3a";
    g.fillRect(-0.5, -1, 1, 2);
    g.restore();
    // Spotted warning.
    if (this.exposure > 0.05) {
      g.strokeStyle = `rgba(255,80,60,${this.exposure / CFG.spotTime})`;
      g.strokeRect(this.x - 7, this.y - 7, 14, 14);
    }
    const mins = Math.max(0, this.time);
    const clock = 4 * 60 - Math.round((mins / TIME) * 120);
    const hh = Math.floor(clock / 60);
    const mm = clock % 60;
    this.status.innerHTML = `Mayın: <b>${this.mines.length}</b>/${CFG.mines} · Saat <b>0${hh}:${mm < 10 ? "0" : ""}${mm}</b> · Görülme: <b class="${this.exposure > 0.5 ? "bad" : ""}">${Math.round((this.exposure / CFG.spotTime) * 100)}%</b>${this.phase === "return" ? " · <b>Kuzeye, Çanakkale'ye dön!</b>" : ""}`;
  }

  protected onEnd(): void {
    const { player, mobile, hud } = this.d;
    player.controlEnabled = true;
    player.lookEnabled = true;
    mobile.setLayout("explore");
    hud.setCrosshair(true);
  }

  /** QA helper for the test bot. */
  get qa(): { phase: string; x: number; y: number; heading: number; laneX: number; mines: number; exposure: number; dropCd: number } {
    return { phase: this.phase, x: this.x, y: this.y, heading: this.heading, laneX: laneX(this.y), mines: this.mines.length, exposure: this.exposure, dropCd: this.dropCd };
  }

  /** QA: lane x at any y. */
  qaLane(y: number): number {
    return laneX(y);
  }
}
