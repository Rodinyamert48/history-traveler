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

const CFG = GAME_CONFIG.minigames.iskender;

export interface IskenderMinigameDeps {
  layer: HTMLElement;
  input: InputManager;
  audio: AudioManager;
  hud: HUD;
  mobile: MobileControls;
  player: Player;
}

const W = 320;
const H = 180;
const SKEWER_X = 160;
const BASE_Y = 128;
const LAYER_H = 10;

const PAL = {
  wall: "#e8dcc0",
  wallDark: "#d4c4a0",
  tile: "#3a7a8a",
  wood: "#8a5a30",
  woodDark: "#5a3a1e",
  woodLight: "#a8743e",
  copper: "#c87a3a",
  copperHi: "#e8a060",
  iron: "#3a3a3e",
  steel: "#c8ccd4",
  meatRaw: "#c86a5a",
  meatMid: "#b05a3a",
  meatGold: "#8a4a20",
  meatBurnt: "#2a1a10",
  fireA: "#ffd060",
  fireB: "#ff8a2a",
  fireC: "#d8401a",
  skin: "#d8a478",
  fez: "#b01a1a",
  fezTassel: "#1a1a1a",
  apron: "#f4f0e6",
  vest: "#3a3a5a",
  mustache: "#2a2018",
  black: "#1c1a1e",
  plate: "#f6f2ea",
  plateRim: "#3a6a9a",
  pide: "#d8a860",
  sauce: "#c8301a",
  butter: "#f0c838",
  yogurt: "#fbfaf4",
  sky: "#9ac4e8",
  hill: "#5a8a4a",
  snow: "#f4f6fa",
  dome: "#4a8a6a",
  minaret: "#f0ead8",
};

type Phase = "intro" | "stack" | "slice" | "plate" | "done";

interface Layer {
  off: number;
  w: number;
}

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

const INGREDIENTS = [
  { id: "pide", label: "PİDE", color: PAL.pide },
  { id: "et", label: "DÖNER", color: PAL.meatGold },
  { id: "sos", label: "DOMATES SOSU", color: PAL.sauce },
  { id: "yag", label: "KIZGIN TEREYAĞI", color: PAL.butter },
  { id: "yogurt", label: "YOĞURT", color: PAL.yogurt },
] as const;

/** Bowls on the counter, in a shuffled order (the recipe order is the INGREDIENTS order). */
const BOWL_ORDER = [2, 4, 0, 3, 1];

/**
 * MINIGAME — "İskender'in Keşfi" (a 2D pixel-art interlude, Bursa 1867).
 * Centuries after the conquest, a Bursa cook named İskender Efendi turns the age-old çevirme
 * on its end: the meat stacked on a vertical skewer, roasting before an upright wood fire and
 * cut in thin leaves. Stack the leaves on the skewer, slice each face as it browns, then plate
 * it the way the town would remember: pide, döner, tomato sauce, sizzling butter and yoghurt.
 */
export class IskenderMinigame extends BaseMinigame {
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private bg!: HTMLCanvasElement;
  private banner!: HTMLDivElement;
  private steps!: HTMLDivElement;
  private status!: HTMLDivElement;
  private phase: Phase = "intro";
  private phaseT = 0;
  private layers: Layer[] = [];
  private leafX = 0;
  private leafDir = 1;
  private falling: { x: number; y: number; vy: number; off: number } | null = null;
  private brown = 0;
  private slices = 0;
  private wasted = 0;
  private knifeT = -1;
  private spin = 0;
  private plateStep = 0;
  private sel = 0;
  private butterT = 0;
  private bits: Bit[] = [];
  private rnd = new Random(1867);

  constructor(private readonly d: IskenderMinigameDeps) {
    super(d.layer);
  }

  protected onStart(): void {
    const { player, mobile, hud, audio } = this.d;
    player.controlEnabled = false;
    player.lookEnabled = false;
    mobile.setActionButtons([
      { label: "◀", action: "left" },
      { label: "TAMAM", action: "jump" },
      { label: "▶", action: "right" },
    ]);
    mobile.setLayout("action");
    hud.setCrosshair(false);
    this.phase = "intro";
    this.phaseT = 0;
    this.layers = [];
    this.falling = null;
    this.leafX = 100;
    this.leafDir = 1;
    this.brown = 0.1;
    this.slices = 0;
    this.wasted = 0;
    this.plateStep = 0;
    this.sel = 0;
    this.bits = [];
    this.buildUi();
    this.showBanner("BURSA · 1867<small>Yüzyıllar sonra, aynı şehirde: İskender Efendi'nin dükkânı. Çevirme yatarak değil, dikine dönecek…</small>", 3.6);
    audio.play("fireCrackle", { volume: 0.5 });
  }

  private buildUi(): void {
    const wrap = el("div", "pixel-duel iskender", this.ui);
    this.canvas = el("canvas", "pd-canvas", wrap);
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext("2d")!;
    this.ctx.imageSmoothingEnabled = false;
    this.banner = el("div", "pd-banner", wrap);
    this.steps = el("div", "isk-steps", wrap);
    this.status = el("div", "pd-help", wrap);
    this.bg = this.paintBackground();
    this.updateSteps();
  }

  private showBanner(html: string, seconds: number): void {
    this.banner.innerHTML = html;
    this.banner.classList.remove("show");
    void this.banner.offsetWidth;
    this.banner.classList.add("show");
    window.setTimeout(() => this.banner.classList.remove("show"), seconds * 1000);
  }

  private updateSteps(): void {
    const s = (i: number, label: string) => {
      const cur = ["stack", "slice", "plate"].indexOf(this.phase);
      const cls = cur === i ? "cur" : cur > i || this.phase === "done" ? "done" : "";
      return `<span class="${cls}">${i + 1} · ${label}</span>`;
    };
    this.steps.innerHTML = s(0, "DİKİNE DİZ") + s(1, "İNCE KES") + s(2, "TABAĞA KOY");
    const touch = this.d.input.isTouch;
    const help: Record<Phase, string> = {
      intro: "",
      stack: touch ? "TAMAM: yaprağı şişin tam üstüne bırak" : "SPACE / tık: et yaprağını şişin tam üstüne bırak",
      slice: touch ? "TAMAM: ateşe dönen yüz kızarınca ince kes" : "SPACE / tık: bıçağa dönen yüz kızarınca (yeşil bölge) ince kes",
      plate: touch ? "◀ ▶ seç · TAMAM: tabağa koy — tarifin sırasıyla" : "A/D veya ←/→ seç · SPACE: tabağa koy — tarifin sırasıyla",
      done: "",
    };
    this.status.textContent = help[this.phase];
  }

  private setPhase(p: Phase): void {
    this.phase = p;
    this.phaseT = 0;
    this.updateSteps();
  }

  // =================================================================== update
  protected update(dt: number): void {
    dt = Math.min(dt, 1 / 30);
    const { input, audio } = this.d;
    this.phaseT += dt;
    this.spin += dt * (this.phase === "slice" ? 1.6 : 0.6);
    const press = input.wasPressed("jump") || input.wasPressed("fire") || input.wasPressed("interact");
    if (input.wasPressed("action") && this.phase !== "done") {
      this.finish(false);
      return;
    }
    switch (this.phase) {
      case "intro":
        if (this.phaseT > 3.8 || (press && this.phaseT > 0.6)) {
          this.setPhase("stack");
          this.showBanner("1 · DİKİNE DİZ<small>Kuzu etini yaprak yaprak şişe diz.</small>", 2);
        }
        break;
      case "stack":
        this.updateStack(dt, press);
        break;
      case "slice":
        this.updateSlice(dt, press);
        break;
      case "plate":
        if (input.wasPressed("left")) this.sel = (this.sel + 4) % 5;
        if (input.wasPressed("right")) this.sel = (this.sel + 1) % 5;
        if (press) this.addToPlate();
        this.butterT = Math.max(0, this.butterT - dt);
        break;
      case "done":
        if (this.phaseT > 4.2) this.finish(true);
        break;
    }
    this.knifeT = this.knifeT >= 0 ? this.knifeT + dt : -1;
    if (this.knifeT > 0.35) this.knifeT = -1;
    this.bits = this.bits.filter((b) => {
      b.vy += 260 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      return b.life > 0;
    });
    // Steam over the plate once the butter is on.
    if (this.butterT > 0 && Math.random() < 0.5) this.bits.push({ x: 160 + this.rnd.range(-20, 20), y: 104, vx: this.rnd.range(-4, 4), vy: -30, life: 0.8, color: "#ffffff", size: 1 });
    if (this.phase === "slice" && Math.random() < dt * 6) audio.play("fireCrackle", { volume: 0.12 });
    this.render();
  }

  private updateStack(dt: number, press: boolean): void {
    const { audio } = this.d;
    const speed = 70 + this.layers.length * 12;
    if (!this.falling) {
      this.leafX += this.leafDir * speed * dt;
      if (this.leafX > SKEWER_X + 60) this.leafDir = -1;
      if (this.leafX < SKEWER_X - 60) this.leafDir = 1;
      if (press) {
        this.falling = { x: this.leafX, y: 30, vy: 0, off: this.leafX - SKEWER_X };
        audio.play("drop", { volume: 0.3 });
      }
      return;
    }
    const f = this.falling;
    f.vy += 500 * dt;
    f.y += f.vy * dt;
    const topY = BASE_Y - this.layers.length * LAYER_H - LAYER_H;
    if (f.y >= topY) {
      this.falling = null;
      const off = Math.abs(f.off);
      if (off <= 11) {
        this.layers.push({ off: Math.round(f.off * 0.35), w: 26 + this.layers.length * 1.6 });
        audio.play(off < 4 ? "perfect" : "good", { volume: 0.45 });
        audio.play("knifeChop", { volume: 0.2, pitch: 0.6 });
        if (this.layers.length >= CFG.layers) {
          this.setPhase("slice");
          this.showBanner("2 · İNCE KES<small>Ateşe dönen yüz kızardıkça yaprak yaprak kes.</small>", 2.2);
          audio.play("objective", { volume: 0.6 });
        }
      } else {
        audio.play("miss", { volume: 0.4 });
        for (let i = 0; i < 6; i++) this.bits.push({ x: f.x, y: topY, vx: this.rnd.range(-60, 60), vy: this.rnd.range(-80, -20), life: 0.7, color: PAL.meatRaw, size: 2 });
      }
    }
  }

  private updateSlice(dt: number, press: boolean): void {
    const { audio } = this.d;
    this.brown += CFG.brownRate * dt;
    if (press && this.knifeT < 0) {
      this.knifeT = 0;
      audio.play("knifeChop", { volume: 0.5 });
      const b = this.brown;
      if (b >= CFG.good[0] && b <= CFG.good[1]) {
        this.slices++;
        this.brown = 0.08;
        audio.play("good", { volume: 0.4 });
        for (let i = 0; i < 5; i++) this.bits.push({ x: SKEWER_X + 18, y: 60 + i * 12, vx: this.rnd.range(10, 40), vy: this.rnd.range(-20, 10), life: 0.9, color: PAL.meatGold, size: 2 });
        if (this.slices >= CFG.slices) {
          this.setPhase("plate");
          this.showBanner("3 · TABAĞA KOY<small>Bursa'nın hatırlayacağı sırayla.</small>", 2.2);
          audio.play("objective", { volume: 0.6 });
        }
      } else if (b < CFG.good[0]) {
        audio.play("miss", { volume: 0.3 });
        this.showBanner("ÇİĞ!<small>Yüz daha kızarmadı.</small>", 0.9);
      }
    }
    if (this.brown > 1.55) {
      this.wasted++;
      this.brown = 0.08;
      audio.play("miss", { volume: 0.4 });
      this.showBanner("YANDI!<small>O yüzü kazıyıp at — dikkat.</small>", 1);
      for (let i = 0; i < 6; i++) this.bits.push({ x: SKEWER_X + 18, y: 60 + i * 10, vx: this.rnd.range(10, 40), vy: -20, life: 0.8, color: PAL.meatBurnt, size: 2 });
    }
  }

  private addToPlate(): void {
    const { audio } = this.d;
    const pick = BOWL_ORDER[this.sel];
    if (pick !== this.plateStep) {
      audio.play("miss", { volume: 0.35 });
      this.showBanner(`SIRA YANLIŞ<small>Önce: ${INGREDIENTS[this.plateStep].label.toLowerCase()}</small>`, 1.2);
      return;
    }
    this.plateStep++;
    if (pick === 3) {
      this.butterT = 3;
      audio.play("sizzle", { volume: 0.8 });
    } else audio.play("pickup", { volume: 0.4 });
    if (this.plateStep >= INGREDIENTS.length) {
      this.setPhase("done");
      this.butterT = 4;
      audio.play("fanfare", { volume: 0.6 });
      this.showBanner("İSKENDER KEBAP<small>Bursa, 1867 — İskender Efendi'nin dikine döneri bir şehrin adı oldu.</small>", 4);
    }
  }

  // ================================================================== drawing
  private paintBackground(): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d")!;
    const r = (x: number, y: number, w: number, h: number, col: string) => {
      g.fillStyle = col;
      g.fillRect(x, y, w, h);
    };
    // Back wall, tiled lower band.
    r(0, 0, W, H, PAL.wall);
    for (let y = 0; y < 100; y += 6) for (let x = (y / 6) % 2 ? 0 : 3; x < W; x += 6) r(x, y, 1, 1, PAL.wallDark);
    r(0, 92, W, 40, PAL.tile);
    for (let x = 0; x < W; x += 10) for (let y = 92; y < 132; y += 10) {
      r(x, y, 10, 1, "#2a5a6a");
      r(x, y, 1, 10, "#2a5a6a");
      r(x + 4, y + 4, 2, 2, "#e8dcc0");
    }
    // Window onto Bursa: Uludağ, green domes and minarets.
    r(228, 14, 80, 62, PAL.woodDark);
    r(232, 18, 72, 54, PAL.sky);
    g.fillStyle = PAL.hill;
    g.beginPath();
    g.moveTo(232, 60);
    g.lineTo(256, 34);
    g.lineTo(276, 44);
    g.lineTo(292, 28);
    g.lineTo(304, 40);
    g.lineTo(304, 72);
    g.lineTo(232, 72);
    g.fill();
    g.fillStyle = PAL.snow;
    g.beginPath();
    g.moveTo(286, 34);
    g.lineTo(292, 28);
    g.lineTo(298, 34);
    g.fill();
    r(232, 58, 72, 14, "#c8b898");
    for (const [x, rr] of [
      [246, 6],
      [270, 8],
      [290, 5],
    ]) {
      g.fillStyle = PAL.dome;
      g.beginPath();
      g.arc(x, 58, rr, Math.PI, 0);
      g.fill();
    }
    r(258, 36, 2, 22, PAL.minaret);
    r(282, 40, 2, 18, PAL.minaret);
    r(267, 18, 2, 54, PAL.woodDark);
    r(232, 44, 72, 2, PAL.woodDark);
    // Shelf with copper pans on the left.
    r(10, 40, 70, 4, PAL.wood);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = PAL.copper;
      g.beginPath();
      g.arc(20 + i * 16, 34, 6, 0, Math.PI * 2);
      g.fill();
      r(18 + i * 16, 30, 2, 2, PAL.copperHi);
    }
    r(14, 60, 60, 3, PAL.wood);
    for (let i = 0; i < 5; i++) r(18 + i * 11, 50, 7, 10, i % 2 ? "#e8e0cc" : "#c8a060");
    // Sign above: "İSKENDER EFENDİ".
    r(100, 6, 120, 14, PAL.woodDark);
    r(102, 8, 116, 10, "#e8c860");
    g.fillStyle = PAL.woodDark;
    g.font = "bold 8px monospace";
    g.textAlign = "center";
    g.fillText("KEBAPÇI İSKENDER", 160, 16);
    // The counter.
    r(0, 132, W, 48, PAL.wood);
    r(0, 132, W, 3, PAL.woodLight);
    for (let x = 0; x < W; x += 24) r(x, 135, 1, 45, PAL.woodDark);
    return c;
  }

  private render(): void {
    const g = this.ctx;
    const r = (x: number, y: number, w: number, h: number, col: string) => {
      g.fillStyle = col;
      g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    };
    g.drawImage(this.bg, 0, 0);
    const t = this.elapsed;
    if (this.phase === "plate" || (this.phase === "done" && this.plateStep >= 5)) {
      this.renderPlate(r, t);
    } else {
      // The upright wood fire (odun ateşi dikine), left of the skewer.
      r(118, 40, 18, 92, PAL.iron);
      for (let i = 0; i < 8; i++) {
        const y = 44 + i * 11;
        const flick = Math.sin(t * 14 + i * 1.7) * 2;
        r(121, y, 12, 9, PAL.fireC);
        r(123 + flick * 0.5, y + 1, 8, 6, PAL.fireB);
        r(125 + flick * 0.3, y + 2, 4, 4, PAL.fireA);
      }
      // Skewer and base.
      r(SKEWER_X - 1, 36, 2, BASE_Y - 34, PAL.steel);
      r(SKEWER_X - 14, BASE_Y, 28, 4, PAL.iron);
      // Meat layers; the face toward the fire browns with the slicing phase.
      const faceCol = this.brownColor(this.brown);
      this.layers.forEach((l, i) => {
        const y = BASE_Y - (i + 1) * LAYER_H;
        const x = SKEWER_X + l.off - l.w / 2;
        r(x, y, l.w, LAYER_H - 1, PAL.meatMid);
        r(x, y + LAYER_H - 2, l.w, 1, "#8a3a2a");
        // Rotating stripes show the spin.
        const sh = Math.floor((this.spin * 12 + i * 3) % 6);
        for (let k = sh; k < l.w; k += 6) r(x + k, y + 1, 1, LAYER_H - 3, "#d88a6a");
        if (this.phase === "slice" || this.phase === "done") r(x + l.w - 5, y, 5, LAYER_H - 1, faceCol);
      });
      // The leaf in the hands, sliding left and right, and a falling one.
      if (this.phase === "stack") {
        if (!this.falling) {
          r(this.leafX - 14, 24, 28, 6, PAL.meatRaw);
          r(this.leafX - 1, 18, 2, 6, PAL.skin);
          const off = Math.abs(this.leafX - SKEWER_X);
          r(SKEWER_X - 11, 33, 22, 1, off <= 11 ? "#9fd26b" : "#e2655a");
        } else r(this.falling.x - 14, this.falling.y, 28, 6, PAL.meatRaw);
      }
      // Browning gauge beside the döner.
      if (this.phase === "slice") {
        r(92, 40, 8, 92, PAL.black);
        this.ctx.fillStyle = PAL.woodDark;
        this.ctx.font = "bold 6px monospace";
        this.ctx.textAlign = "center";
        this.ctx.fillText("KIZARMA", 96, 37);
        const k = clamp(this.brown / 1.55, 0, 1);
        const g0 = 1 - CFG.good[1] / 1.55;
        const g1 = 1 - CFG.good[0] / 1.55;
        r(93, 41 + g0 * 90, 6, (g1 - g0) * 90, "#3a6a2a");
        r(93, 41 + (1 - k) * 90, 6, 2, faceCol === PAL.meatBurnt ? "#e2655a" : "#ffe8a0");
        // Tray of sliced döner at the front.
        r(228, 140, 46, 10, PAL.copper);
        for (let i = 0; i < this.slices; i++) r(231 + (i % 4) * 10, 138 + Math.floor(i / 4) * 4, 9, 3, PAL.meatGold);
      }
      this.renderCook(r, t);
    }
    for (const b of this.bits) r(b.x, b.y, b.size, b.size, b.color);
  }

  private brownColor(b: number): string {
    if (b < 0.45) return PAL.meatRaw;
    if (b < CFG.good[0]) return PAL.meatMid;
    if (b <= CFG.good[1] + 0.12) return PAL.meatGold;
    return PAL.meatBurnt;
  }

  /** İskender Efendi: fez, waistcoat, white apron, long knife. */
  private renderCook(r: (x: number, y: number, w: number, h: number, c: string) => void, t: number): void {
    const x = 196;
    const y = 52;
    r(x, y + 26, 22, 56, PAL.vest);
    r(x + 2, y + 34, 18, 48, PAL.apron);
    r(x + 4, y + 8, 14, 16, PAL.skin);
    r(x + 6, y + 18, 10, 2, PAL.mustache);
    r(x + 7, y + 13, 2, 2, PAL.black);
    r(x + 13, y + 13, 2, 2, PAL.black);
    r(x + 4, y, 14, 9, PAL.fez);
    r(x + 16, y + 2, 2, 8, PAL.fezTassel);
    r(x + 8, y + 24, 6, 3, PAL.skin);
    // Knife arm: raised, then a downward stroke along the döner's face.
    const k = this.knifeT >= 0 ? this.knifeT / 0.35 : 0;
    const ay = y + 36 + Math.sin(k * Math.PI) * 30 + Math.sin(t * 2) * 1;
    r(x - 12, ay, 14, 4, PAL.vest);
    r(x - 16, ay, 4, 4, PAL.skin);
    r(x - 34, ay + 1, 18, 2, PAL.steel);
    r(x - 16, ay - 1, 2, 6, PAL.woodDark);
  }

  private renderPlate(r: (x: number, y: number, w: number, h: number, c: string) => void, t: number): void {
    const g = this.ctx;
    // Copper tray with the plate.
    g.fillStyle = PAL.copper;
    g.beginPath();
    g.ellipse(160, 112, 74, 22, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = PAL.plateRim;
    g.beginPath();
    g.ellipse(160, 108, 56, 16, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = PAL.plate;
    g.beginPath();
    g.ellipse(160, 108, 52, 14, 0, 0, Math.PI * 2);
    g.fill();
    const s = this.plateStep;
    if (s > 0) for (let i = 0; i < 10; i++) r(128 + (i % 5) * 12, 100 + Math.floor(i / 5) * 6, 9, 5, PAL.pide);
    if (s > 1) for (let i = 0; i < 12; i++) r(126 + (i % 6) * 10, 98 + Math.floor(i / 6) * 4, 9, 3, PAL.meatGold);
    if (s > 2) for (let i = 0; i < 8; i++) r(130 + i * 7, 97 + (i % 2) * 4, 5, 2, PAL.sauce);
    if (s > 3) for (let i = 0; i < 6; i++) r(134 + i * 9, 96 + Math.sin(t * 8 + i) * 1, 4, 2, PAL.butter);
    if (s > 4) {
      g.fillStyle = PAL.yogurt;
      g.beginPath();
      g.ellipse(200, 106, 10, 5, 0, 0, Math.PI * 2);
      g.fill();
      r(198, 103, 3, 1, "#e8e0d0");
    }
    // The bowls on the counter.
    if (this.phase !== "plate") return;
    BOWL_ORDER.forEach((ing, i) => {
      const x = 36 + i * 62;
      const y = 150;
      const sel = i === this.sel;
      const used = ing < this.plateStep;
      if (sel) r(x - 22, y - 12, 44, 30, "#ffe8a0");
      g.fillStyle = used ? "#7a6a5a" : PAL.copper;
      g.beginPath();
      g.ellipse(x, y + 6, 18, 8, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = used ? "#a89a88" : INGREDIENTS[ing].color;
      g.beginPath();
      g.ellipse(x, y + 3, 14, 5, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = sel ? PAL.black : "#f4ecd8";
      g.font = "bold 7px monospace";
      g.textAlign = "center";
      g.fillText(INGREDIENTS[ing].label, x, y + 24 > H - 2 ? H - 2 : y + 24);
    });
    // The recipe card.
    r(8, 8, 92, 56, "#f4ecd8");
    r(8, 8, 92, 2, PAL.woodDark);
    g.fillStyle = PAL.woodDark;
    g.font = "bold 7px monospace";
    g.textAlign = "left";
    g.fillText("TARİF", 12, 18);
    INGREDIENTS.forEach((ing, i) => {
      g.fillStyle = i < this.plateStep ? "#3a7a2a" : i === this.plateStep ? PAL.sauce : PAL.woodDark;
      g.fillText(`${i + 1}. ${ing.label}`, 12, 28 + i * 8);
    });
  }

  protected onEnd(): void {
    const { player, mobile, hud } = this.d;
    player.controlEnabled = true;
    player.lookEnabled = true;
    mobile.setLayout("explore");
    hud.setCrosshair(true);
  }

  /** QA helper for the test bot. */
  get qa(): { phase: Phase; leafOff: number; falling: boolean; brown: number; plateStep: number; sel: number; bowl: number } {
    return { phase: this.phase, leafOff: this.leafX - SKEWER_X, falling: !!this.falling, brown: this.brown, plateStep: this.plateStep, sel: this.sel, bowl: BOWL_ORDER[this.sel] };
  }
}
