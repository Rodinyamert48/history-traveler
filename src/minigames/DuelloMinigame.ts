import type { AudioManager } from "../audio/AudioManager";
import { GAME_CONFIG } from "../config/gameConfig";
import type { InputManager } from "../core/InputManager";
import type { Player } from "../entities/Player";
import type { HUD } from "../ui/HUD";
import type { MobileControls } from "../ui/MobileControls";
import { el, setText } from "../ui/dom";
import { clamp } from "../utils/math";
import { Random } from "../utils/random";
import { BaseMinigame } from "./BaseMinigame";

const CFG = GAME_CONFIG.minigames.duello;

export interface DuelloMinigameDeps {
  layer: HTMLElement;
  input: InputManager;
  audio: AudioManager;
  hud: HUD;
  mobile: MobileControls;
  player: Player;
  bossName: string;
}

// Virtual screen (pixels) and world constants.
const W = 320;
const H = 180;
const GROUND = 152;
const GRAVITY = 720;
const LEFT = 14;
const RIGHT = W - 14;

const PAL = {
  skin: "#d8a478",
  skinDark: "#b88458",
  khaki: "#8a8458",
  khakiDark: "#6a6444",
  khakiHat: "#a29a6a",
  puttee: "#9a9068",
  boot: "#4a3020",
  leather: "#6a4428",
  wood: "#8a5a30",
  iron: "#3a3a3e",
  steel: "#c8ccd4",
  black: "#1c1a1e",
  blackHi: "#38343a",
  red: "#a8202a",
  beard: "#2a2018",
  white: "#ffffff",
  dust: "#c8b48a",
  stone: "#8a8478",
};

type BossState = "intro" | "idle" | "walk" | "windSlash" | "slash" | "recover" | "windDash" | "dash" | "windThrow" | "windSlam" | "air" | "stun" | "defeat";

interface Fighter {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  hp: number;
  hurt: number;
}

interface Stone {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Wave {
  x: number;
  dir: number;
  life: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

/**
 * MINIGAME — "Köy Yolunda Düello" (2D pixel-art boss fight).
 * A retro side-view fight against the leader of an armed band that raids the villages. Move,
 * jump, strike with the rifle butt and block (a block just before his slash parries and stuns
 * him). He telegraphs every attack: a dagger slash, a charging dash, thrown stones and — once
 * he is enraged — a leaping ground slam whose shockwave must be jumped. Beat him and he
 * surrenders.
 */
export class DuelloMinigame extends BaseMinigame {
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private bg!: HTMLCanvasElement;
  private banner!: HTMLDivElement;
  private me: Fighter = { x: 70, y: GROUND, vx: 0, vy: 0, facing: 1, hp: 0, hurt: 0 };
  private boss: Fighter = { x: 250, y: GROUND, vx: 0, vy: 0, facing: -1, hp: 0, hurt: 0 };
  private bossState: BossState = "intro";
  private bossT = 0;
  private bossDur = 0;
  private bossHitThisSwing = false;
  private phase2 = false;
  private attackT = -1;
  private attackHit = false;
  private combo = 0;
  private comboT = 0;
  private blockT = -1;
  private inv = 0;
  private walkT = 0;
  private stones: Stone[] = [];
  private waves: Wave[] = [];
  private parts: Particle[] = [];
  private shake = 0;
  private flashT = 0;
  private end = 0;
  private won = false;
  private rnd = new Random(1919);

  constructor(private readonly d: DuelloMinigameDeps) {
    super(d.layer);
  }

  protected onStart(): void {
    const { player, mobile, hud, audio } = this.d;
    player.controlEnabled = false;
    player.lookEnabled = false;
    mobile.setActionButtons([
      { label: "◀", action: "left" },
      { label: "▶", action: "right" },
      { label: "ZIPLA", action: "jump" },
      { label: "VUR", action: "fire" },
      { label: "SİPER", action: "back" },
    ]);
    mobile.setLayout("action");
    hud.setCrosshair(false);
    this.me = { x: 70, y: GROUND, vx: 0, vy: 0, facing: 1, hp: CFG.playerHp, hurt: 0 };
    this.boss = { x: 250, y: GROUND, vx: 0, vy: 0, facing: -1, hp: CFG.bossHp, hurt: 0 };
    this.bossState = "intro";
    this.bossT = 0;
    this.bossDur = 2.2;
    this.phase2 = false;
    this.attackT = -1;
    this.combo = 0;
    this.blockT = -1;
    this.inv = 0;
    this.stones = [];
    this.waves = [];
    this.parts = [];
    this.end = 0;
    this.won = false;
    this.buildUi();
    this.showBanner(`ER (SEN) <i>VS</i> ${this.d.bossName.toUpperCase()}`, 2.0);
    audio.playMusic("tension");
    audio.play("drum", { volume: 0.8 });
  }

  private buildUi(): void {
    const wrap = el("div", "pixel-duel", this.ui);
    this.canvas = el("canvas", "pd-canvas", wrap);
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext("2d")!;
    this.ctx.imageSmoothingEnabled = false;
    this.banner = el("div", "pd-banner", wrap);
    el(
      "div",
      "pd-help",
      wrap,
      this.d.input.isTouch
        ? "◀ ▶ hareket · ZIPLA · VUR (dipçik) · SİPER basılı: savun — saldırıdan hemen önce siper alırsan sersemletirsin"
        : "A/D hareket · W/SPACE zıpla · Sol tık / E vur (dipçik) · S basılı: siper — kama savrulmadan hemen önce siper alırsan sersemletirsin",
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

  // =================================================================== drawing
  private paintBackground(): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d")!;
    const rnd = new Random(519);
    // Dawn sky in dithered bands.
    const bands = ["#1e2a52", "#2a3a68", "#3e4a78", "#6a5a82", "#a46a78", "#d88a6a", "#f0b07a", "#f6cf96"];
    const bandH = 92 / bands.length;
    bands.forEach((col, i) => {
      g.fillStyle = col;
      g.fillRect(0, Math.floor(i * bandH), W, Math.ceil(bandH) + 1);
      if (i > 0) {
        g.fillStyle = bands[i - 1];
        for (let x = (i % 2) * 2; x < W; x += 4) g.fillRect(x, Math.floor(i * bandH), 2, 1);
      }
    });
    // Rising sun over the sea.
    g.fillStyle = "#ffe0a0";
    for (let y = -12; y <= 0; y++) {
      const w = Math.floor(Math.sqrt(144 - y * y));
      g.fillRect(240 - w, 92 + y, w * 2, 1);
    }
    // The sea with glints.
    g.fillStyle = "#2a5a7a";
    g.fillRect(0, 92, W, 14);
    g.fillStyle = "#3a7a9a";
    for (let i = 0; i < 70; i++) g.fillRect(rnd.int(0, W), rnd.int(93, 105), rnd.int(2, 5), 1);
    g.fillStyle = "#ffd890";
    for (let i = 0; i < 18; i++) g.fillRect(rnd.int(222, 258), rnd.int(93, 104), rnd.int(1, 4), 1);
    // A tiny steamer on the horizon (the Bandırma!).
    g.fillStyle = "#1a1a1a";
    g.fillRect(80, 89, 14, 3);
    g.fillRect(86, 85, 2, 4);
    g.fillStyle = "#7a7a80";
    g.fillRect(84, 81, 4, 3);
    g.fillRect(80, 79, 4, 2);
    // Far hills.
    const ridge = (base: number, amp: number, col: string, seed: number) => {
      g.fillStyle = col;
      for (let x = 0; x < W; x++) {
        const h = Math.round(base - amp * (0.5 + 0.5 * Math.sin(x * 0.03 + seed) * Math.cos(x * 0.011 + seed * 2)));
        g.fillRect(x, h, 1, H - h);
      }
    };
    ridge(104, 14, "#3a4a5a", 1);
    ridge(118, 18, "#3f5a2e", 4);
    // Farmhouse on the slope.
    g.fillStyle = "#8a8478";
    g.fillRect(36, 104, 22, 8);
    g.fillStyle = "#6a4a2a";
    g.fillRect(34, 96, 26, 8);
    g.fillStyle = "#9a4a2a";
    for (let i = 0; i < 6; i++) g.fillRect(32 + i, 96 - i, 30 - i * 2, 1);
    g.fillStyle = "#2a2420";
    g.fillRect(40, 99, 3, 3);
    g.fillRect(50, 99, 3, 3);
    g.fillRect(45, 106, 4, 6);
    // Near slope and the dirt road.
    ridge(136, 10, "#4f7a32", 7);
    g.fillStyle = "#5a8a32";
    g.fillRect(0, GROUND - 2, W, 3);
    g.fillStyle = "#6a5038";
    g.fillRect(0, GROUND + 1, W, H - GROUND);
    g.fillStyle = "#7a6044";
    for (let i = 0; i < 120; i++) g.fillRect(rnd.int(0, W), rnd.int(GROUND + 2, H), rnd.int(1, 3), 1);
    g.fillStyle = "#4a3a28";
    for (let i = 0; i < 60; i++) g.fillRect(rnd.int(0, W), rnd.int(GROUND + 2, H), 1, 1);
    // Fence posts.
    g.fillStyle = "#5a3a20";
    for (let x = 6; x < W; x += 26) {
      g.fillRect(x, GROUND - 16, 2, 15);
      g.fillRect(x - 1, GROUND - 13, 26, 1);
      g.fillRect(x - 1, GROUND - 7, 26, 1);
    }
    return c;
  }

  /** Draws a pixel rectangle relative to a fighter, mirrored by its facing. */
  private px(f: Fighter, dx: number, dy: number, w: number, h: number, color: string, white = false): void {
    const g = this.ctx;
    g.fillStyle = white ? PAL.white : color;
    const x = f.facing > 0 ? f.x + dx : f.x - dx - w;
    g.fillRect(Math.round(x), Math.round(f.y + dy), w, h);
  }

  private line(f: Fighter, x0: number, y0: number, x1: number, y1: number, color: string, white = false): void {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) this.px(f, Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), 1, 1, color, white);
  }

  private drawSoldier(): void {
    const f = this.me;
    const white = f.hurt > 0 && Math.floor(f.hurt * 20) % 2 === 0;
    if (this.inv > 0 && Math.floor(this.inv * 12) % 2 === 1 && !white) return;
    const air = f.y < GROUND - 0.5;
    const moving = Math.abs(f.vx) > 5 && !air;
    const step = moving ? (Math.floor(this.walkT * 10) % 2 ? 1 : -1) : 0;
    const blocking = this.blockT >= 0;
    const P = (dx: number, dy: number, w: number, h: number, c: string) => this.px(f, dx, dy, w, h, c, white);
    // Boots and puttees.
    P(-4 + step, -2, 3, 2, PAL.boot);
    P(1 - step, -2, 3, 2, PAL.boot);
    P(-3 + step, air ? -8 : -9, 2, air ? 6 : 7, PAL.puttee);
    P(1 - step, air ? -8 : -9, 2, air ? 6 : 7, PAL.puttee);
    // Breeches, tunic, belt and cross strap.
    P(-4, -12, 8, 4, PAL.khakiDark);
    P(-4, -21, 8, 10, PAL.khaki);
    P(-4, -13, 8, 1, PAL.leather);
    for (let i = 0; i < 7; i++) P(-3 + i, -20 + i, 1, 1, PAL.leather);
    // Head, mustache, kabalak.
    P(-2, -26, 5, 5, PAL.skin);
    P(2, -24, 1, 1, PAL.black);
    P(1, -22, 3, 1, PAL.beard);
    P(-3, -29, 7, 3, PAL.khakiHat);
    P(-2, -30, 5, 1, PAL.khakiHat);
    P(-3, -27, 7, 1, PAL.khakiDark);
    // Arms and the rifle.
    if (this.attackT >= 0) {
      // Butt-stroke: the rifle swings forward horizontally, butt first.
      const k = this.attackT / 0.3;
      const reach = k < 0.5 ? Math.round(k * 2 * 10) : Math.round((1 - k) * 2 * 10);
      P(2, -19, 4 + reach / 2, 2, PAL.khaki);
      this.line(f, -6 + reach, -17, 6 + reach, -17, PAL.iron, white);
      P(6 + reach, -18, 6, 3, PAL.wood);
    } else if (blocking) {
      // Rifle held up crosswise to parry.
      P(2, -20, 3, 2, PAL.khaki);
      this.line(f, 6, -29, 6, -10, PAL.iron, white);
      P(5, -16, 3, 7, PAL.wood);
    } else {
      P(1, -20, 2, 7, PAL.khaki);
      this.line(f, -1, -12, 7, -27, PAL.iron, white);
      P(-2, -12, 3, 4, PAL.wood);
    }
  }

  private drawBoss(): void {
    const f = this.boss;
    const st = this.bossState;
    const white = (f.hurt > 0 && Math.floor(f.hurt * 20) % 2 === 0) || ((st === "windSlash" || st === "windDash" || st === "windThrow" || st === "windSlam") && Math.floor(this.bossT * 14) % 2 === 0);
    const P = (dx: number, dy: number, w: number, h: number, c: string) => this.px(f, dx, dy, w, h, c, white && c !== PAL.white);
    if (st === "defeat") {
      // On his knees, hands raised, the dagger on the ground in front of him.
      P(-5, -3, 10, 3, PAL.black);
      P(-5, -14, 10, 11, PAL.black);
      P(-5, -6, 10, 2, PAL.red);
      P(-3, -20, 6, 6, PAL.skin);
      P(-3, -16, 6, 2, PAL.beard);
      P(-4, -23, 8, 3, PAL.black);
      P(-7, -26, 2, 12, PAL.blackHi);
      P(5, -26, 2, 12, PAL.blackHi);
      P(-7, -28, 2, 2, PAL.skin);
      P(5, -28, 2, 2, PAL.skin);
      this.ctx.fillStyle = PAL.steel;
      this.ctx.fillRect(Math.round(f.x + f.facing * 14) - 4, GROUND - 1, 8, 1);
      return;
    }
    const air = f.y < GROUND - 0.5;
    const crouch = st === "windDash" || st === "windSlam" ? 3 : 0;
    const moving = (st === "walk" || st === "dash") && !air;
    const step = moving ? (Math.floor(this.bossT * (st === "dash" ? 18 : 8)) % 2 ? 1 : -1) : 0;
    // Boots, trousers.
    P(-5 + step, -3, 4, 3, PAL.boot);
    P(1 - step, -3, 4, 3, PAL.boot);
    P(-4 + step, -11 + crouch, 3, 8 - crouch, PAL.black);
    P(1 - step, -11 + crouch, 3, 8 - crouch, PAL.black);
    // Body with a red sash and crossed bandoliers.
    const by = crouch;
    P(-5, -24 + by, 10, 14, PAL.black);
    P(-5, -13 + by, 10, 2, PAL.red);
    for (let i = 0; i < 9; i++) {
      P(-4 + i, -23 + by + i, 1, 1, PAL.leather);
      P(4 - i, -23 + by + i, 1, 1, PAL.leather);
    }
    // Head: beard, kerchief with its knot.
    P(-3, -30 + by, 6, 6, PAL.skin);
    P(-3, -26 + by, 6, 2, PAL.beard);
    P(2, -28 + by, 1, 1, PAL.black);
    P(-4, -33 + by, 8, 3, PAL.black);
    P(-6, -31 + by, 2, 4, PAL.black);
    // Arm and dagger.
    if (st === "slash") {
      P(4, -21 + by, 9, 2, PAL.blackHi);
      P(13, -22 + by, 7, 1, PAL.steel);
      this.ctx.fillStyle = "rgba(255,255,255,0.6)";
      for (let i = 0; i < 6; i++) this.ctx.fillRect(Math.round(f.x + f.facing * (14 + i * 2)) - (f.facing < 0 ? 1 : 0), Math.round(f.y - 30 + i * 2 + by), 2, 1);
    } else if (st === "windSlash") {
      P(-2, -32 + by, 2, 10, PAL.blackHi);
      P(-2, -38 + by, 1, 6, PAL.steel);
    } else if (st === "windThrow" || st === "windSlam") {
      P(-6, -34 + by, 2, 12, PAL.blackHi);
      P(-6, -36 + by, 3, 3, st === "windThrow" ? PAL.stone : PAL.skin);
    } else {
      P(3, -22 + by, 2, 9, PAL.blackHi);
      P(4, -13 + by, 1, 5, PAL.steel);
    }
    // Warning mark over his head.
    if (st.startsWith("wind")) {
      const g = this.ctx;
      g.fillStyle = "#ffd36a";
      g.fillRect(Math.round(f.x) - 1, Math.round(f.y - 44), 2, 6);
      g.fillRect(Math.round(f.x) - 1, Math.round(f.y - 37), 2, 2);
    }
    if (st === "stun") {
      const g = this.ctx;
      g.fillStyle = "#ffd36a";
      for (let i = 0; i < 3; i++) {
        const a = this.elapsed * 6 + (i * Math.PI * 2) / 3;
        g.fillRect(Math.round(f.x + Math.cos(a) * 8), Math.round(f.y - 38 + Math.sin(a) * 2), 2, 2);
      }
    }
  }

  private drawHud(): void {
    const g = this.ctx;
    // Hearts.
    for (let i = 0; i < CFG.playerHp; i++) {
      const x = 8 + i * 10;
      const full = i < this.me.hp;
      g.fillStyle = full ? "#d8283a" : "#4a2a30";
      g.fillRect(x, 9, 3, 2);
      g.fillRect(x + 4, 9, 3, 2);
      g.fillRect(x - 1, 10, 9, 3);
      g.fillRect(x, 13, 7, 1);
      g.fillRect(x + 1, 14, 5, 1);
      g.fillRect(x + 2, 15, 3, 1);
      g.fillRect(x + 3, 16, 1, 1);
    }
    // Boss bar.
    const bw = 120;
    const bx = W - bw - 8;
    g.fillStyle = "#1a1418";
    g.fillRect(bx - 1, 9, bw + 2, 7);
    g.fillStyle = "#4a1a20";
    g.fillRect(bx, 10, bw, 5);
    g.fillStyle = this.phase2 ? "#e8402a" : "#c8303a";
    g.fillRect(bx, 10, Math.round((bw * Math.max(0, this.boss.hp)) / CFG.bossHp), 5);
    g.fillStyle = "#f0d8a0";
    g.fillRect(bx, 10, Math.round((bw * Math.max(0, this.boss.hp)) / CFG.bossHp), 1);
  }

  private render(): void {
    const g = this.ctx;
    const sx = this.shake > 0 ? Math.round((this.rnd.next() - 0.5) * this.shake * 6) : 0;
    const sy = this.shake > 0 ? Math.round((this.rnd.next() - 0.5) * this.shake * 4) : 0;
    g.save();
    g.translate(sx, sy);
    g.drawImage(this.bg, 0, 0);
    // Shadows.
    g.fillStyle = "rgba(20,14,8,0.35)";
    for (const f of [this.me, this.boss]) g.fillRect(Math.round(f.x) - 6, GROUND - 1, 12, 2);
    for (const w of this.waves) {
      g.fillStyle = "#c8b48a";
      g.fillRect(Math.round(w.x) - 3, GROUND - 6, 6, 6);
      g.fillStyle = "#e8d8b0";
      g.fillRect(Math.round(w.x) - 2, GROUND - 8, 4, 2);
    }
    this.drawBoss();
    this.drawSoldier();
    g.fillStyle = PAL.stone;
    for (const s of this.stones) g.fillRect(Math.round(s.x) - 2, Math.round(s.y) - 2, 4, 4);
    for (const p of this.parts) {
      g.fillStyle = p.color;
      g.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
    }
    g.restore();
    if (this.flashT > 0) {
      g.fillStyle = `rgba(255,255,255,${(this.flashT * 2).toFixed(2)})`;
      g.fillRect(0, 0, W, H);
    }
    this.drawHud();
  }

  // =================================================================== game logic
  private burst(x: number, y: number, n: number, color: string): void {
    for (let i = 0; i < n; i++) this.parts.push({ x, y, vx: this.rnd.range(-70, 70), vy: this.rnd.range(-110, -20), life: this.rnd.range(0.25, 0.6), color });
  }

  private hurtPlayer(fromX: number): void {
    if (this.inv > 0 || this.end) return;
    const { audio } = this.d;
    const facingThreat = Math.sign(fromX - this.me.x) === this.me.facing;
    if (this.blockT >= 0 && facingThreat) {
      // Blocked: pushed back, no damage.
      this.me.vx = -this.me.facing * 90;
      audio.play("woodClash", { volume: 0.7 });
      this.burst(this.me.x + this.me.facing * 8, this.me.y - 18, 5, "#ffe8a0");
      this.shake = 0.3;
      return;
    }
    this.me.hp--;
    this.me.hurt = 0.3;
    this.inv = 0.9;
    this.me.vx = Math.sign(this.me.x - fromX || 1) * 130;
    this.me.vy = -130;
    this.shake = 0.6;
    audio.play("miss", { volume: 0.6 });
    audio.play("land", { volume: 0.6 });
    this.burst(this.me.x, this.me.y - 16, 8, PAL.dust);
    if (this.me.hp <= 0) {
      this.end = 0.001;
      this.won = false;
      this.showBanner("YENİLDİN<small>Toparlan ve yeniden dene!</small>", 2.4);
    }
  }

  private hitBoss(dmg: number): void {
    const { audio } = this.d;
    const b = this.boss;
    if (this.bossState === "defeat" || this.bossState === "intro") return;
    const stunned = this.bossState === "stun";
    b.hp -= stunned ? dmg * 2 : dmg;
    b.hurt = 0.2;
    this.shake = 0.35;
    audio.play("woodKnock", { volume: 0.8, pitch: 0.8 });
    this.burst(b.x, b.y - 20, 6, "#ffe8a0");
    // Light attacks interrupt him only while he is not committed to an attack.
    if (["idle", "walk", "recover"].includes(this.bossState)) b.vx = this.me.facing * 60;
    if (!this.phase2 && b.hp <= CFG.bossHp / 2) {
      this.phase2 = true;
      this.showBanner("ÇETE REİSİ ÖFKELENDİ!<small>Sıçrayıp yeri sarsacak — dalgaların üstünden zıpla!</small>", 2.4);
      audio.play("distantShout", { volume: 0.7 });
    }
    if (b.hp <= 0) {
      b.hp = 0;
      this.bossState = "defeat";
      this.bossT = 0;
      this.stones = [];
      this.waves = [];
      this.end = 0.001;
      this.won = true;
      this.flashT = 0.5;
      this.showBanner("TESLİM OL!<small>Çete reisi kamasını bıraktı, ellerini kaldırdı.</small>", 3);
      audio.play("stun", { volume: 0.8 });
      window.setTimeout(() => this.active && audio.play("cheer", { volume: 0.6 }), 600);
    }
  }

  private setBoss(state: BossState, dur: number): void {
    this.bossState = state;
    this.bossT = 0;
    this.bossDur = dur;
    this.bossHitThisSwing = false;
  }

  private chooseAttack(): void {
    const b = this.boss;
    const m = this.phase2 ? 0.78 : 1;
    const dist = Math.abs(this.me.x - b.x);
    const r = this.rnd.next();
    if (this.phase2 && r < 0.22) return this.setBoss("windSlam", 0.55 * m);
    if (dist > 70) {
      if (r < 0.5) return this.setBoss("windDash", 0.55 * m);
      if (r < 0.85) return this.setBoss("windThrow", 0.45 * m);
      return this.setBoss("walk", 1.4);
    }
    if (dist < 40) return r < 0.72 ? this.setBoss("windSlash", 0.5 * m) : this.setBoss("windDash", 0.55 * m);
    return r < 0.5 ? this.setBoss("walk", 1.2) : this.setBoss("windThrow", 0.45 * m);
  }

  private updateBoss(dt: number): void {
    const b = this.boss;
    const m = this.phase2 ? 0.78 : 1;
    const speed = this.phase2 ? 1.25 : 1;
    this.bossT += dt;
    b.hurt = Math.max(0, b.hurt - dt);
    const toMe = Math.sign(this.me.x - b.x) || 1;
    if (!["dash", "slash", "air", "defeat"].includes(this.bossState)) b.facing = toMe as 1 | -1;
    // Physics.
    b.vy += GRAVITY * dt;
    b.y += b.vy * dt;
    if (b.y >= GROUND) {
      if (this.bossState === "air") this.slamLand();
      b.y = GROUND;
      b.vy = 0;
    }
    b.x = clamp(b.x + b.vx * dt, LEFT, RIGHT);
    if (this.bossState !== "dash" && this.bossState !== "air") b.vx *= Math.pow(0.02, dt);
    switch (this.bossState) {
      case "intro":
        if (this.bossT >= this.bossDur) this.setBoss("idle", 0.8);
        break;
      case "idle":
        if (this.bossT >= this.bossDur) this.chooseAttack();
        break;
      case "walk":
        b.vx = toMe * 46 * speed;
        if (Math.abs(this.me.x - b.x) < 34) this.setBoss("windSlash", 0.45 * m);
        else if (this.bossT >= this.bossDur) this.setBoss("idle", 0.3);
        break;
      case "windSlash":
        b.vx = 0;
        if (this.bossT >= this.bossDur) {
          this.setBoss("slash", 0.16);
          this.d.audio.play("arrowWhoosh", { volume: 0.6, pitch: 1.6 });
          // A block raised just before the slash parries it.
          if (this.blockT >= 0 && this.blockT <= CFG.parryWindow && Math.sign(b.x - this.me.x) === this.me.facing) {
            this.parry();
          }
        }
        break;
      case "slash": {
        b.vx = b.facing * 50;
        const reach = this.me.x - b.x;
        if (!this.bossHitThisSwing && Math.sign(reach) === b.facing && Math.abs(reach) < 32 && this.me.y > GROUND - 30) {
          this.bossHitThisSwing = true;
          this.hurtPlayer(b.x);
        }
        if (this.bossT >= this.bossDur) this.setBoss("recover", 0.55 * m);
        break;
      }
      case "recover":
        if (this.bossT >= this.bossDur) this.setBoss("idle", this.rnd.range(0.4, 0.9) * m);
        break;
      case "windDash":
        b.vx = 0;
        if (Math.floor(this.bossT * 20) % 3 === 0) this.burst(b.x - b.facing * 6, GROUND - 1, 1, PAL.dust);
        if (this.bossT >= this.bossDur) {
          this.setBoss("dash", 0.75);
          b.vx = b.facing * 245 * speed;
          this.d.audio.play("arrowWhoosh", { volume: 0.7, pitch: 0.7 });
        }
        break;
      case "dash":
        if (!this.bossHitThisSwing && Math.abs(this.me.x - b.x) < 12 && this.me.y > GROUND - 26) {
          this.bossHitThisSwing = true;
          this.hurtPlayer(b.x - b.facing * 10);
        }
        if (b.x <= LEFT + 1 || b.x >= RIGHT - 1 || this.bossT >= this.bossDur) {
          b.vx = 0;
          this.shake = b.x <= LEFT + 1 || b.x >= RIGHT - 1 ? 0.4 : 0;
          this.setBoss("recover", 0.7 * m);
        }
        break;
      case "windThrow":
        if (this.bossT >= this.bossDur) {
          const n = this.phase2 ? 3 : 2;
          for (let i = 0; i < n; i++) {
            const tFlight = 0.8 + i * 0.2;
            const dx = this.me.x - b.x + this.rnd.range(-20, 20);
            this.stones.push({ x: b.x, y: b.y - 34, vx: dx / tFlight, vy: -0.5 * 420 * tFlight + 34 / tFlight });
          }
          this.d.audio.play("arrowWhoosh", { volume: 0.5, pitch: 1.2 });
          this.setBoss("recover", 0.6 * m);
        }
        break;
      case "windSlam":
        b.vx = 0;
        if (this.bossT >= this.bossDur) {
          this.setBoss("air", 2);
          b.vy = -310;
          b.vx = clamp((this.me.x - b.x) / 0.85, -160, 160);
          this.d.audio.play("jump", { volume: 0.7 });
        }
        break;
      case "air":
        break;
      case "stun":
        b.vx = 0;
        if (this.bossT >= this.bossDur) this.setBoss("idle", 0.5);
        break;
      case "defeat":
        b.vx = 0;
        break;
    }
  }

  private slamLand(): void {
    const b = this.boss;
    b.vx = 0;
    this.shake = 0.8;
    this.d.audio.play("impactStone", { volume: 0.8 });
    this.burst(b.x, GROUND - 2, 12, PAL.dust);
    this.waves.push({ x: b.x - 8, dir: -1, life: 1.6 }, { x: b.x + 8, dir: 1, life: 1.6 });
    if (Math.abs(this.me.x - b.x) < 14 && this.me.y > GROUND - 10) this.hurtPlayer(b.x);
    this.setBoss("recover", 0.8);
  }

  private parry(): void {
    this.setBoss("stun", 1.4);
    this.flashT = 0.25;
    this.shake = 0.5;
    this.d.audio.play("stun", { volume: 0.8 });
    this.d.audio.play("woodClash", { volume: 0.9 });
    this.burst(this.boss.x - this.boss.facing * 8, this.boss.y - 22, 10, "#ffe8a0");
    this.showBanner("KARŞILADIN!<small>Sersemledi — şimdi vur!</small>", 1.4);
  }

  private updatePlayer(dt: number): void {
    const { input, audio } = this.d;
    const f = this.me;
    f.hurt = Math.max(0, f.hurt - dt);
    this.inv = Math.max(0, this.inv - dt);
    const onGround = f.y >= GROUND - 0.5;
    const blocking = input.isDown("back") && onGround && this.attackT < 0;
    this.blockT = blocking ? (this.blockT < 0 ? 0 : this.blockT + dt) : -1;
    let move = 0;
    if (input.isDown("left")) move -= 1;
    if (input.isDown("right")) move += 1;
    const speed = blocking ? 30 : this.attackT >= 0 ? 40 : 95;
    const target = move * speed;
    // Knockback decays; otherwise steer toward the wanted speed.
    f.vx += (target - f.vx) * clamp(dt * (onGround ? 14 : 5), 0, 1);
    if (move !== 0 && this.attackT < 0 && !blocking) f.facing = move as 1 | -1;
    if (onGround && (input.wasPressed("jump") || input.wasPressed("forward")) && !blocking) {
      f.vy = -245;
      audio.play("jump", { volume: 0.5 });
    }
    if ((input.wasPressed("fire") || input.wasPressed("interact")) && this.attackT < 0 && !blocking) {
      this.attackT = 0;
      this.attackHit = false;
      this.combo = this.comboT > 0 ? this.combo + 1 : 1;
      this.comboT = 0.6;
      audio.play("arrowWhoosh", { volume: 0.35, pitch: 1.8 });
    }
    this.comboT = Math.max(0, this.comboT - dt);
    if (this.attackT >= 0) {
      this.attackT += dt;
      if (!this.attackHit && this.attackT >= 0.07 && this.attackT <= 0.18) {
        const reach = this.boss.x - f.x;
        if (Math.sign(reach) === f.facing && Math.abs(reach) < 28 && Math.abs(this.boss.y - f.y) < 26) {
          this.attackHit = true;
          this.hitBoss(this.combo >= 3 ? 2 : 1);
          if (this.combo >= 3) this.combo = 0;
        }
      }
      if (this.attackT >= 0.3) this.attackT = -1;
    }
    f.vy += GRAVITY * dt;
    f.y += f.vy * dt;
    if (f.y >= GROUND) {
      if (f.vy > 200) audio.play("land", { volume: 0.3 });
      f.y = GROUND;
      f.vy = 0;
    }
    f.x = clamp(f.x + f.vx * dt, LEFT, RIGHT);
    // The two can't stand inside each other.
    const gap = this.boss.x - f.x;
    if (Math.abs(gap) < 10 && Math.abs(this.boss.y - f.y) < 20 && this.bossState !== "dash" && this.bossState !== "defeat") f.x = this.boss.x - Math.sign(gap || 1) * 10;
    this.walkT += dt;
  }

  protected update(dt: number): void {
    dt = Math.min(dt, 1 / 30);
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.flashT = Math.max(0, this.flashT - dt);
    if (this.end) {
      this.end += dt;
      if (this.won) this.updateBoss(dt);
      if (this.end > (this.won ? 3.2 : 2.6)) this.finish(this.won);
    } else {
      if (this.bossState !== "intro") this.updatePlayer(dt);
      this.updateBoss(dt);
      // Thrown stones.
      this.stones = this.stones.filter((s) => {
        s.vy += 420 * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        if (Math.abs(s.x - this.me.x) < 7 && s.y > this.me.y - 28 && s.y < this.me.y) {
          this.hurtPlayer(s.x - s.vx * 0.05);
          return false;
        }
        if (s.y >= GROUND) {
          this.burst(s.x, GROUND - 2, 3, PAL.stone);
          return false;
        }
        return true;
      });
      // Ground shockwaves.
      this.waves = this.waves.filter((w) => {
        w.x += w.dir * 165 * dt;
        w.life -= dt;
        if (Math.abs(w.x - this.me.x) < 6 && this.me.y > GROUND - 8) this.hurtPlayer(w.x - w.dir * 4);
        return w.life > 0 && w.x > 0 && w.x < W;
      });
    }
    this.parts = this.parts.filter((p) => {
      p.vy += 300 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      return p.life > 0;
    });
    this.render();
  }

  protected onEnd(): void {
    const { player, mobile, hud } = this.d;
    player.controlEnabled = true;
    player.lookEnabled = true;
    mobile.setLayout("explore");
    hud.setCrosshair(true);
    setText(this.banner, "");
  }

  /** QA helper for the test bot. */
  get qa(): { me: number; boss: number; dist: number; state: BossState; meHp: number; bossHp: number; air: boolean } {
    return { me: this.me.x, boss: this.boss.x, dist: this.boss.x - this.me.x, state: this.bossState, meHp: this.me.hp, bossHp: this.boss.hp, air: this.me.y < GROUND - 1 };
  }
}
