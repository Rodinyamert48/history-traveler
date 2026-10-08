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

const CFG = GAME_CONFIG.minigames.ordu;

export interface OrduMinigameDeps {
  layer: HTMLElement;
  input: InputManager;
  audio: AudioManager;
  hud: HUD;
  mobile: MobileControls;
  player: Player;
}

// Map (logical pixels).
const W = 384;
const H = 216;
const CITY = { x: 238, y: 100, rx: 60, ry: 42 };
const FORT = { x: 40, y: 54 };

interface Gate {
  name: string;
  x: number;
  y: number;
  /** Where a besieging unit stands, outside the gate. */
  hx: number;
  hy: number;
  hold: number;
  lost: number;
  blockaded: boolean;
}

type Kind = "cav" | "inf" | "arch" | "guard" | "enemy" | "boss";

interface Unit {
  name: string;
  short: string;
  kind: Kind;
  side: "o" | "b";
  x: number;
  y: number;
  /** Ordered position (Ottoman) or home gate (Byzantine). */
  ax: number;
  ay: number;
  hp: number;
  maxHp: number;
  dps: number;
  range: number;
  speed: number;
  color: string;
  dead: boolean;
  respawn: number;
  life: number;
  flash: number;
  /** Boss charge state. */
  windup?: number;
  dash?: number;
  dashX?: number;
  dashY?: number;
  chargeCd?: number;
  hitThisDash?: Set<Unit>;
}

interface Convoy {
  route: number;
  seg: number;
  t: number;
  x: number;
  y: number;
  done: boolean;
}

interface Fx {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

interface Arrow {
  x: number;
  y: number;
  tx: number;
  ty: number;
  t: number;
}

const ROUTES: [number, number][][] = [
  [
    [150, 0],
    [196, 30],
    [230, 56],
  ],
  [
    [384, 66],
    [340, 84],
    [300, 94],
  ],
  [
    [0, 154],
    [96, 134],
    [176, 104],
  ],
  [
    [384, 192],
    [304, 162],
    [246, 144],
  ],
];
const ROUTE_GATE = [1, 2, 0, 3];

const PAL = {
  grass: "#6f8f3e",
  grassDark: "#5f7f36",
  grassLight: "#82a24a",
  field: "#b8a868",
  road: "#c8b080",
  river: "#4a8ab0",
  forest: "#3f5a2e",
  rock: "#8a867a",
  snow: "#eef0f4",
  wall: "#a89c86",
  wallDark: "#6a6050",
  roof: "#b0503a",
  roofDark: "#8a3a2a",
  church: "#d8ccb4",
  dome: "#8a8c90",
  ottoman: "#c8201f",
  ottomanGreen: "#1f6a3a",
  byz: "#6a2a6a",
  byzGold: "#d6a540",
  convoy: "#8a5a30",
  black: "#1c1a1e",
  white: "#ffffff",
  sel: "#ffe8a0",
};

/**
 * MINIGAME — "Bursa'nın Fethi" (final: 2D top-down army command).
 * At Orhan Gazi's war table the siege becomes a map. Command five bands of gazis: stand them
 * before Bursa's gates to blockade them, cut the supply convoys on the roads and beat off the
 * garrison's sorties. As the city's will to resist falls, the Tekfur rides out with his heavy
 * cavalry for a last sortie — break it and Bursa surrenders (6 April 1326).
 */
export class OrduMinigame extends BaseMinigame {
  override readonly freeCursor = true;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private bg!: HTMLCanvasElement;
  private banner!: HTMLDivElement;
  private moraleFill!: HTMLDivElement;
  private moraleTxt!: HTMLSpanElement;
  private goals!: HTMLDivElement;
  private cards: { root: HTMLDivElement; hp: HTMLDivElement; state: HTMLSpanElement }[] = [];
  private gates: Gate[] = [];
  private units: Unit[] = [];
  private enemies: Unit[] = [];
  private convoys: Convoy[] = [];
  private arrows: Arrow[] = [];
  private fx: Fx[] = [];
  private sel = 0;
  private morale = 100;
  private cut = 0;
  private convoyT = 0;
  private sortieT = 0;
  private boss: Unit | null = null;
  private phase: "intro" | "siege" | "boss" | "won" | "lost" = "intro";
  private phaseT = 0;
  private marker: { x: number; y: number; t: number } | null = null;
  private rnd = new Random(1326);
  private disposers: (() => void)[] = [];

  constructor(private readonly d: OrduMinigameDeps) {
    super(d.layer);
  }

  protected onStart(): void {
    const { player, mobile, hud, audio, input } = this.d;
    player.controlEnabled = false;
    player.lookEnabled = false;
    input.exitPointerLock();
    mobile.setLayout("hidden");
    hud.setCrosshair(false);
    this.reset();
    this.buildUi();
    this.showBanner("BURSA KUŞATMASI<small>Kapıları kuşat, ikmal yollarını kes, hisarın direncini kır.</small>", 3.4);
    audio.playMusic("tension");
    audio.play("drum", { volume: 0.9 });
  }

  private reset(): void {
    const g = (name: string, x: number, y: number): Gate => {
      const dx = x - CITY.x;
      const dy = y - CITY.y;
      const l = Math.hypot(dx, dy);
      return { name, x, y, hx: x + (dx / l) * 16, hy: y + (dy / l) * 16, hold: 0, lost: 0, blockaded: false };
    };
    this.gates = [g("Kaplıca Kapısı", 178, 104), g("Yer Kapısı", 230, 58), g("Zindan Kapısı", 298, 94), g("Pınarbaşı Kapısı", 246, 142)];
    const u = (name: string, short: string, kind: Kind, hp: number, dps: number, range: number, speed: number, color: string, x: number, y: number): Unit => ({
      name,
      short,
      kind,
      side: "o",
      x,
      y,
      ax: x,
      ay: y,
      hp,
      maxHp: hp,
      dps,
      range,
      speed,
      color,
      dead: false,
      respawn: 0,
      life: 0,
      flash: 0,
    });
    this.units = [
      u("Orhan Gazi'nin muhafızları", "Orhan Gazi", "guard", 180, 10, 11, 32, PAL.ottomanGreen, 52, 66),
      u("Akçakoca'nın akıncıları", "Akçakoca", "cav", 95, 9, 11, 46, PAL.ottoman, 60, 50),
      u("Konur Alp'in yayaları", "Konur Alp", "inf", 140, 8, 10, 22, "#8a4a1a", 44, 76),
      u("Abdurrahman Gazi'nin okçuları", "Abdurrahman", "arch", 75, 7, 46, 26, "#2a5a8a", 30, 66),
      u("Turgut Alp'in süvarileri", "Turgut Alp", "cav", 115, 11, 11, 40, "#a8641a", 66, 40),
    ];
    this.enemies = [];
    this.convoys = [];
    this.arrows = [];
    this.fx = [];
    this.sel = 0;
    this.morale = CFG.morale;
    this.cut = 0;
    this.convoyT = 4;
    this.sortieT = CFG.sortieEvery;
    this.boss = null;
    this.phase = "intro";
    this.phaseT = 0;
    this.marker = null;
  }

  private buildUi(): void {
    const wrap = el("div", "pixel-duel ordu", this.ui);
    const top = el("div", "ordu-top", wrap);
    const m = el("div", "ordu-morale", top);
    const mr = el("div", "om-row", m);
    el("span", "", mr, "BURSA HİSARININ DİRENCİ");
    this.moraleTxt = el("span", "om-val", mr, "100");
    const track = el("div", "om-track", m);
    const mark = el("div", "om-mark", track);
    mark.style.left = `${CFG.bossAt}%`;
    this.moraleFill = el("div", "om-fill", track);
    this.goals = el("div", "ordu-goals", top);
    this.canvas = el("canvas", "pd-canvas", wrap);
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext("2d")!;
    this.ctx.imageSmoothingEnabled = false;
    this.banner = el("div", "pd-banner", wrap);
    const row = el("div", "ordu-cards", wrap);
    this.cards = this.units.map((unit, i) => {
      const root = el("div", "ordu-card", row);
      root.style.setProperty("--c", unit.color);
      el("b", "", root, `${i + 1}`);
      el("span", "oc-name", root, unit.short);
      const t = el("div", "oc-track", root);
      const hp = el("div", "oc-hp", t);
      const state = el("span", "oc-state", root, "");
      const pick = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        this.select(i);
      };
      root.addEventListener("pointerdown", pick);
      return { root, hp, state };
    });
    el(
      "div",
      "pd-help",
      wrap,
      this.d.input.isTouch
        ? "Birliğe dokun: seç · haritaya dokun: oraya gönder · kapı önünde bekleyen birlik kapıyı kuşatır, yoldaki kafileleri keser"
        : "Tıkla / 1–5: birlik seç · haritaya tıkla (sağ tık da olur): oraya gönder · kapı önünde bekleyen birlik kapıyı kuşatır, yoldaki kafileleri keser",
    );
    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      const r = this.canvas.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * W;
      const y = ((e.clientY - r.top) / r.height) * H;
      this.click(x, y, e.button === 2);
    };
    const onCtx = (e: Event) => e.preventDefault();
    const onKey = (e: KeyboardEvent) => {
      const n = /^Digit([1-5])$/.exec(e.code);
      if (n) this.select(Number(n[1]) - 1);
    };
    this.canvas.addEventListener("pointerdown", onDown);
    this.canvas.addEventListener("contextmenu", onCtx);
    window.addEventListener("keydown", onKey);
    this.disposers.push(
      () => this.canvas.removeEventListener("pointerdown", onDown),
      () => this.canvas.removeEventListener("contextmenu", onCtx),
      () => window.removeEventListener("keydown", onKey),
    );
    this.bg = this.paintMap();
    this.updateUi();
  }

  private showBanner(html: string, seconds: number): void {
    this.banner.innerHTML = html;
    this.banner.classList.remove("show");
    void this.banner.offsetWidth;
    this.banner.classList.add("show");
    window.setTimeout(() => this.banner.classList.remove("show"), seconds * 1000);
  }

  // =================================================================== orders
  private select(i: number): void {
    if (i < 0 || i >= this.units.length) return;
    this.sel = i;
    this.d.audio.play("keyClick", { volume: 0.4 });
    this.updateUi();
  }

  private click(x: number, y: number, move: boolean): void {
    if (this.phase === "won" || this.phase === "lost") return;
    if (!move) {
      let best = -1;
      let bd = 12;
      this.units.forEach((u, i) => {
        if (u.dead) return;
        const dd = Math.hypot(u.x - x, u.y - y);
        if (dd < bd) {
          bd = dd;
          best = i;
        }
      });
      if (best >= 0) {
        this.select(best);
        return;
      }
    }
    this.order(this.sel, x, y);
  }

  /** Sends unit i to (x, y), kept outside the city walls and on the map. */
  order(i: number, x: number, y: number): void {
    const u = this.units[i];
    if (!u || u.dead) return;
    const p = this.outside(clamp(x, 6, W - 6), clamp(y, 6, H - 22), 8);
    u.ax = p.x;
    u.ay = p.y;
    this.marker = { x: p.x, y: p.y, t: 0.8 };
    this.d.audio.play("drum", { volume: 0.25, pitch: 1.6 });
  }

  private outside(x: number, y: number, pad: number): { x: number; y: number } {
    const dx = (x - CITY.x) / (CITY.rx + pad);
    const dy = (y - CITY.y) / (CITY.ry + pad);
    const k = Math.hypot(dx, dy);
    if (k >= 1) return { x, y };
    if (k < 0.001) return { x: CITY.x - CITY.rx - pad, y: CITY.y };
    return { x: CITY.x + (dx / k) * (CITY.rx + pad), y: CITY.y + (dy / k) * (CITY.ry + pad) };
  }

  // =================================================================== update
  protected update(dt: number): void {
    dt = Math.min(dt, 1 / 20);
    this.phaseT += dt;
    if (this.d.input.wasPressed("action") && this.phase !== "won") {
      this.finish(false);
      return;
    }
    if (this.phase === "intro" && this.phaseT > 1.5) {
      this.phase = "siege";
      this.phaseT = 0;
    }
    if (this.phase === "won" || this.phase === "lost") {
      if (this.phaseT > 4.2) this.finish(this.phase === "won");
      this.stepFx(dt);
      this.render();
      return;
    }
    if (this.marker) {
      this.marker.t -= dt;
      if (this.marker.t <= 0) this.marker = null;
    }
    this.stepUnits(dt);
    this.stepGates(dt);
    if (this.phase === "siege") {
      this.stepConvoys(dt);
      this.sortieT -= dt;
      if (this.sortieT <= 0) {
        this.sortieT = CFG.sortieEvery * this.rnd.range(0.8, 1.2);
        this.sortie();
      }
      const blockaded = this.gates.filter((g) => g.blockaded).length;
      this.morale -= blockaded * CFG.blockadeDrain * dt;
      if (this.morale <= CFG.bossAt) this.startBoss();
    }
    this.stepFx(dt);
    this.render();
    this.updateUi();
  }

  private stepUnits(dt: number): void {
    const all = [...this.units, ...this.enemies];
    for (const u of all) {
      u.flash = Math.max(0, u.flash - dt);
      if (u.dead) continue;
      u.life += dt;
    }
    // Ottoman bands: go where ordered; once there, fight anything that comes close.
    this.units.forEach((u, i) => {
      if (u.dead) {
        u.respawn -= dt;
        if (u.respawn <= 0 && i !== 0) {
          u.dead = false;
          u.hp = u.maxHp;
          u.x = FORT.x + 10;
          u.y = FORT.y + 10;
          u.ax = u.x;
          u.ay = u.y;
          if (i === this.sel) this.updateUi();
        }
        return;
      }
      // Bands that reached their post fight whatever comes near it; bands on the march keep going.
      const foe = this.nearest(u, this.enemies, u.kind === "arch" ? 54 : 34);
      const posted = Math.hypot(u.ax - u.x, u.ay - u.y) < 20;
      if (foe && Math.hypot(foe.x - u.x, foe.y - u.y) <= u.range + 2) this.attack(u, foe, dt);
      else if (foe && posted && Math.hypot(foe.x - u.ax, foe.y - u.ay) < 48) this.moveToward(u, foe.x, foe.y, dt);
      else this.moveToward(u, u.ax, u.ay, dt);
      // Rest heals.
      if (!this.nearest(u, this.enemies, 40)) u.hp = Math.min(u.maxHp, u.hp + 3 * dt);
    });
    // Garrison sorties and the Tekfur.
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.kind === "boss") {
        this.stepBoss(e, dt);
        continue;
      }
      const home = { x: e.ax, y: e.ay };
      const foe = e.life < 26 ? this.nearestFrom(home.x, home.y, this.units, 120) : null;
      if (foe) {
        const fd = Math.hypot(foe.x - e.x, foe.y - e.y);
        if (fd <= e.range + 2) this.attack(e, foe, dt);
        else this.moveToward(e, foe.x, foe.y, dt, true);
      } else {
        // Back through the gate.
        this.moveToward(e, home.x, home.y, dt, true);
        if (Math.hypot(home.x - e.x, home.y - e.y) < 3) e.dead = true;
      }
    }
    this.enemies = this.enemies.filter((e) => !e.dead || e.kind === "boss");
    // Arrows (visual only, damage is applied by attack()).
    this.arrows = this.arrows.filter((a) => {
      a.t += dt * 3;
      return a.t < 1;
    });
    // Orhan Gazi must not fall.
    if (this.units[0].dead && this.phase !== "lost") {
      this.phase = "lost";
      this.phaseT = 0;
      this.d.audio.play("miss", { volume: 0.8 });
      this.showBanner("ORHAN GAZİ GERİ ÇEKİLDİ<small>Bey'in muhafızlarını koru — kuşatmayı yeniden dene.</small>", 4);
    }
  }

  private stepBoss(b: Unit, dt: number): void {
    const { audio } = this.d;
    b.chargeCd = (b.chargeCd ?? 4) - dt;
    if (b.dash && b.dash > 0) {
      b.dash -= dt;
      const dx = (b.dashX ?? b.x) - b.x;
      const dy = (b.dashY ?? b.y) - b.y;
      const l = Math.hypot(dx, dy);
      if (l > 2) {
        const s = Math.min(l, 100 * dt);
        b.x += (dx / l) * s;
        b.y += (dy / l) * s;
        const p = this.outside(b.x, b.y, 2);
        b.x = p.x;
        b.y = p.y;
      } else b.dash = 0;
      for (const u of this.units) {
        if (u.dead || b.hitThisDash?.has(u)) continue;
        if (Math.hypot(u.x - b.x, u.y - b.y) < 12) {
          b.hitThisDash?.add(u);
          this.damage(u, 24);
          audio.play("woodClash", { volume: 0.6 });
          this.burst(u.x, u.y, 8, PAL.byzGold);
        }
      }
      return;
    }
    const foe = this.nearestFrom(b.x, b.y, this.units, 400);
    if (!foe) return;
    if (b.windup && b.windup > 0) {
      b.windup -= dt;
      b.flash = 0.1;
      if (b.windup <= 0) {
        b.dash = 1.0;
        const dx = foe.x - b.x;
        const dy = foe.y - b.y;
        const l = Math.max(1, Math.hypot(dx, dy));
        b.dashX = b.x + (dx / l) * Math.min(90, l + 20);
        b.dashY = b.y + (dy / l) * Math.min(90, l + 20);
        b.hitThisDash = new Set();
        audio.play("distantShout", { volume: 0.7 });
      }
      return;
    }
    if (b.chargeCd <= 0) {
      b.chargeCd = 6.5;
      b.windup = 0.9;
      audio.play("drum", { volume: 0.8, pitch: 0.7 });
      return;
    }
    const fd = Math.hypot(foe.x - b.x, foe.y - b.y);
    if (fd <= b.range + 2) this.attack(b, foe, dt);
    else this.moveToward(b, foe.x, foe.y, dt, true);
  }

  private nearest(u: Unit, list: Unit[], within: number): Unit | null {
    return this.nearestFrom(u.x, u.y, list, within);
  }

  private nearestFrom(x: number, y: number, list: Unit[], within: number): Unit | null {
    let best: Unit | null = null;
    let bd = within;
    for (const o of list) {
      if (o.dead) continue;
      const dd = Math.hypot(o.x - x, o.y - y);
      if (dd < bd) {
        bd = dd;
        best = o;
      }
    }
    return best;
  }

  private moveToward(u: Unit, tx: number, ty: number, dt: number, enemy = false): void {
    const dx = tx - u.x;
    const dy = ty - u.y;
    const l = Math.hypot(dx, dy);
    if (l < 0.5) return;
    const s = Math.min(l, u.speed * dt);
    u.x += (dx / l) * s;
    u.y += (dy / l) * s;
    if (!enemy || Math.hypot(u.x - u.ax, u.y - u.ay) > 6) {
      const p = this.outside(u.x, u.y, enemy ? 0 : 4);
      u.x = p.x;
      u.y = p.y;
    }
  }

  private attack(a: Unit, t: Unit, dt: number): void {
    this.damage(t, a.dps * dt);
    if (a.kind === "arch" && Math.random() < dt * 3) {
      this.arrows.push({ x: a.x, y: a.y, tx: t.x, ty: t.y, t: 0 });
      this.d.audio.play("arrowWhoosh", { volume: 0.15 });
    } else if (Math.random() < dt * 2.5) {
      this.burst((a.x + t.x) / 2, (a.y + t.y) / 2, 2, PAL.white);
      if (Math.random() < 0.4) this.d.audio.play("woodClash", { volume: 0.18, pitch: 1 + Math.random() * 0.4 });
    }
  }

  private damage(u: Unit, amount: number): void {
    if (u.dead) return;
    u.hp -= amount;
    u.flash = 0.12;
    if (u.hp > 0) return;
    u.hp = 0;
    u.dead = true;
    this.burst(u.x, u.y, 12, u.side === "o" ? PAL.ottoman : PAL.byz);
    if (u.side === "o") {
      u.respawn = 12;
      if (u !== this.units[0]) this.showBanner(`${u.short.toUpperCase()} DAĞILDI<small>Birlik hisarda toparlanıyor…</small>`, 1.8);
      this.d.audio.play("miss", { volume: 0.5 });
    } else if (u.kind === "boss") this.win();
    else this.d.audio.play("good", { volume: 0.4 });
  }

  private stepGates(dt: number): void {
    for (const g of this.gates) {
      const near = this.units.some((u) => !u.dead && Math.hypot(u.x - g.x, u.y - g.y) < 28);
      const contested = this.enemies.some((e) => !e.dead && Math.hypot(e.x - g.x, e.y - g.y) < 26);
      if (near && !contested) {
        g.lost = 0;
        if (!g.blockaded) {
          g.hold += dt;
          if (g.hold >= CFG.blockadeTime) {
            g.blockaded = true;
            this.d.audio.play("objective", { volume: 0.5 });
            this.showBanner(`${g.name.toUpperCase()} KUŞATILDI`, 1.6);
          }
        }
      } else if (!near) {
        g.lost += dt;
        g.hold = Math.max(0, g.hold - dt * 2);
        if (g.blockaded && g.lost > 2) {
          g.blockaded = false;
          this.d.audio.play("miss", { volume: 0.35 });
        }
      }
    }
  }

  private stepConvoys(dt: number): void {
    this.convoyT -= dt;
    if (this.convoyT <= 0) {
      this.convoyT = CFG.convoyEvery * this.rnd.range(0.8, 1.2);
      const route = this.rnd.int(0, ROUTES.length - 1);
      const p = ROUTES[route][0];
      this.convoys.push({ route, seg: 0, t: 0, x: p[0], y: p[1], done: false });
      this.d.audio.play("woodCreak", { volume: 0.25 });
    }
    for (const c of this.convoys) {
      const r = ROUTES[c.route];
      const a = r[c.seg];
      const b = r[c.seg + 1];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      c.t += (13 * dt) / len;
      if (c.t >= 1) {
        c.seg++;
        c.t = 0;
      }
      if (c.seg >= r.length - 1) {
        c.done = true;
        const gate = this.gates[ROUTE_GATE[c.route]];
        if (gate.blockaded) this.intercept(c, `${gate.name} önünde kafile ele geçirildi`);
        else {
          this.morale = Math.min(CFG.morale, this.morale + CFG.convoyIn);
          this.showBanner(`İKMAL ŞEHRE GİRDİ<small>${gate.name} açık kaldı — hisarın direnci arttı.</small>`, 1.8);
          this.d.audio.play("miss", { volume: 0.4 });
        }
        continue;
      }
      const p0 = r[c.seg];
      const p1 = r[c.seg + 1];
      c.x = p0[0] + (p1[0] - p0[0]) * c.t;
      c.y = p0[1] + (p1[1] - p0[1]) * c.t;
      if (this.units.some((u) => !u.dead && Math.hypot(u.x - c.x, u.y - c.y) < 18)) {
        c.done = true;
        this.intercept(c, "Kafile yolda kesildi");
      }
    }
    this.convoys = this.convoys.filter((c) => !c.done);
  }

  private intercept(c: Convoy, text: string): void {
    this.cut++;
    this.morale -= CFG.convoyCut;
    this.burst(c.x, c.y, 10, PAL.convoy);
    this.showBanner(`İKMAL KESİLDİ<small>${text}.</small>`, 1.4);
    this.d.audio.play("good", { volume: 0.5 });
  }

  private sortie(): void {
    // Out of a gate that is blockaded if there is one — the garrison tries to break the ring.
    const blocked = this.gates.filter((g) => g.blockaded);
    const pool = blocked.length ? blocked : this.gates;
    const g = pool[this.rnd.int(0, pool.length - 1)];
    this.enemies.push(this.byz("Bizans piyadesi", g.x, g.y, 70, 6, 10, 24));
    this.d.audio.play("distantShout", { volume: 0.4 });
  }

  private byz(name: string, x: number, y: number, hp: number, dps: number, range: number, speed: number, kind: Kind = "enemy"): Unit {
    return { name, short: name, kind, side: "b", x, y, ax: x, ay: y, hp, maxHp: hp, dps, range, speed, color: PAL.byz, dead: false, respawn: 0, life: 0, flash: 0 };
  }

  private startBoss(): void {
    this.phase = "boss";
    this.phaseT = 0;
    this.morale = CFG.bossAt;
    this.convoys = [];
    const g = this.gates[0];
    this.boss = this.byz("Tekfur'un zırhlı süvarileri", g.x, g.y, CFG.bossHp, 16, 12, 26, "boss");
    this.boss.chargeCd = 3;
    this.enemies.push(this.boss);
    this.enemies.push(this.byz("Tekfur'un muhafızı", this.gates[1].x, this.gates[1].y, 80, 7, 10, 24));
    this.enemies.push(this.byz("Tekfur'un muhafızı", this.gates[3].x, this.gates[3].y, 80, 7, 10, 24));
    for (const e of this.enemies) e.life = -60;
    this.showBanner("TEKFUR'UN SON ÇIKIŞI!<small>Bursa Tekfuru zırhlı süvarileriyle Kaplıca Kapısı'ndan çıktı — hücumunu kır!</small>", 3.6);
    this.d.audio.play("drum", { volume: 1 });
    this.d.audio.play("distantShout", { volume: 0.8 });
  }

  private win(): void {
    this.phase = "won";
    this.phaseT = 0;
    this.morale = 0;
    for (const e of this.enemies) e.dead = true;
    this.showBanner("BURSA TESLİM OLDU!<small>6 Nisan 1326 — Orhan Gazi şehre giriyor.</small>", 4.2);
    this.d.audio.play("fanfare", { volume: 0.8 });
    window.setTimeout(() => this.active && this.d.audio.play("cheer", { volume: 0.7 }), 500);
  }

  private burst(x: number, y: number, n: number, color: string): void {
    for (let i = 0; i < n; i++) this.fx.push({ x, y, vx: this.rnd.range(-30, 30), vy: this.rnd.range(-30, 30), life: this.rnd.range(0.3, 0.7), color });
  }

  private stepFx(dt: number): void {
    this.fx = this.fx.filter((f) => {
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.vx *= 0.92;
      f.vy *= 0.92;
      f.life -= dt;
      return f.life > 0;
    });
  }

  // =================================================================== drawing
  private paintMap(): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d")!;
    const rnd = new Random(7);
    const r = (x: number, y: number, w: number, h: number, col: string) => {
      g.fillStyle = col;
      g.fillRect(x, y, w, h);
    };
    r(0, 0, W, H, PAL.grass);
    for (let i = 0; i < 1600; i++) r(rnd.int(0, W), rnd.int(0, H), 1, 1, rnd.next() < 0.5 ? PAL.grassDark : PAL.grassLight);
    // Fields on the plain.
    for (let i = 0; i < 26; i++) {
      const x = rnd.int(0, W - 30);
      const y = rnd.int(0, 150);
      if (Math.hypot((x - CITY.x) / 90, (y - CITY.y) / 70) < 1) continue;
      r(x, y, rnd.int(14, 30), rnd.int(8, 16), PAL.field);
    }
    // Uludağ: forest and snow along the south.
    for (let x = 0; x < W; x++) {
      const base = 176 + Math.sin(x * 0.05) * 6 + Math.sin(x * 0.013 + 1) * 8 - (x > 200 ? (x - 200) * 0.12 : 0);
      r(x, base, 1, H - base, PAL.forest);
      const rock = base + 12 + Math.sin(x * 0.09) * 3;
      r(x, rock, 1, H - rock, PAL.rock);
      const snow = rock + 8 + Math.sin(x * 0.2) * 2;
      r(x, snow, 1, H - snow, PAL.snow);
    }
    // The Nilüfer stream to the west.
    g.strokeStyle = PAL.river;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(118, 0);
    g.bezierCurveTo(100, 60, 140, 110, 92, 170);
    g.stroke();
    // Roads.
    g.strokeStyle = PAL.road;
    g.lineWidth = 3;
    for (const route of ROUTES) {
      g.beginPath();
      route.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.stroke();
    }
    g.beginPath();
    g.moveTo(FORT.x + 8, FORT.y + 6);
    g.lineTo(178, 104);
    g.stroke();
    // Bursa: houses, church, then the ring of walls with towers.
    g.fillStyle = "#c8b898";
    g.beginPath();
    g.ellipse(CITY.x, CITY.y, CITY.rx, CITY.ry, 0, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 110; i++) {
      const a = rnd.range(0, Math.PI * 2);
      const k = Math.sqrt(rnd.next()) * 0.86;
      const x = CITY.x + Math.cos(a) * CITY.rx * k;
      const y = CITY.y + Math.sin(a) * CITY.ry * k;
      r(Math.round(x), Math.round(y), 4, 3, rnd.next() < 0.5 ? PAL.roof : PAL.roofDark);
    }
    r(CITY.x + 4, CITY.y - 10, 16, 12, PAL.church);
    g.fillStyle = PAL.dome;
    g.beginPath();
    g.arc(CITY.x + 12, CITY.y - 4, 5, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = PAL.wallDark;
    g.lineWidth = 5;
    g.beginPath();
    g.ellipse(CITY.x, CITY.y, CITY.rx, CITY.ry, 0, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = PAL.wall;
    g.lineWidth = 3;
    g.stroke();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      r(Math.round(CITY.x + Math.cos(a) * CITY.rx) - 3, Math.round(CITY.y + Math.sin(a) * CITY.ry) - 3, 6, 6, PAL.wallDark);
      r(Math.round(CITY.x + Math.cos(a) * CITY.rx) - 2, Math.round(CITY.y + Math.sin(a) * CITY.ry) - 2, 4, 4, PAL.wall);
    }
    g.font = "bold 7px monospace";
    g.textAlign = "center";
    g.fillStyle = "#3a2a1a";
    g.fillText("BURSA (PRUSA)", CITY.x, CITY.y + 12);
    // The two siege forts.
    const fort = (x: number, y: number, label: string) => {
      r(x - 7, y - 7, 14, 14, PAL.wallDark);
      r(x - 5, y - 5, 10, 10, PAL.wall);
      r(x - 1, y - 14, 1, 8, PAL.black);
      r(x, y - 14, 5, 3, PAL.ottoman);
      g.fillStyle = "#1c1a1e";
      g.fillText(label, x, y + 15);
    };
    fort(FORT.x, FORT.y, "BALABANCIK");
    fort(352, 32, "AKTİMUR");
    g.fillStyle = "#f4f0e6";
    g.fillText("ULUDAĞ", 300, 208);
    return c;
  }

  private render(): void {
    const g = this.ctx;
    const r = (x: number, y: number, w: number, h: number, col: string) => {
      g.fillStyle = col;
      g.fillRect(Math.round(x), Math.round(y), w, h);
    };
    g.drawImage(this.bg, 0, 0);
    const t = this.elapsed;
    // Gates: blockade ring, label.
    g.font = "bold 6px monospace";
    g.textAlign = "center";
    for (const gate of this.gates) {
      r(gate.x - 3, gate.y - 3, 6, 6, PAL.black);
      g.strokeStyle = gate.blockaded ? PAL.ottoman : "rgba(255,255,255,0.7)";
      g.lineWidth = 1.5;
      g.beginPath();
      const k = gate.blockaded ? 1 : gate.hold / CFG.blockadeTime;
      g.arc(gate.x, gate.y, 11, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
      g.stroke();
      if (!gate.blockaded) {
        g.setLineDash([2, 3]);
        g.strokeStyle = "rgba(255,255,255,0.35)";
        g.beginPath();
        g.arc(gate.x, gate.y, 11, 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
      }
      g.fillStyle = gate.blockaded ? "#ffe0d0" : "#1c1a1e";
      const lx = gate.hx + (gate.hx - gate.x) * 0.6;
      const ly = gate.hy + (gate.hy - gate.y) * 0.6 + 2;
      g.fillText(gate.name.replace(" Kapısı", "").toUpperCase(), lx, ly);
    }
    // Convoys: two ox carts.
    for (const c of this.convoys) {
      for (let k = 0; k < 2; k++) {
        const x = c.x - k * 5;
        const y = c.y - k * 2;
        r(x - 2, y - 2, 5, 3, PAL.convoy);
        r(x - 2, y + 1, 1, 1, PAL.black);
        r(x + 2, y + 1, 1, 1, PAL.black);
        r(x - 1, y - 3, 3, 1, "#e8dcc0");
      }
    }
    // Move marker and the selected unit's order line.
    const s = this.units[this.sel];
    if (s && !s.dead && Math.hypot(s.ax - s.x, s.ay - s.y) > 3) {
      g.strokeStyle = "rgba(255,232,160,0.55)";
      g.setLineDash([2, 2]);
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(s.x, s.y);
      g.lineTo(s.ax, s.ay);
      g.stroke();
      g.setLineDash([]);
    }
    if (this.marker) {
      const m = this.marker;
      const k = 3 + (1 - m.t) * 4;
      g.strokeStyle = PAL.sel;
      g.beginPath();
      g.moveTo(m.x - k, m.y - k);
      g.lineTo(m.x + k, m.y + k);
      g.moveTo(m.x + k, m.y - k);
      g.lineTo(m.x - k, m.y + k);
      g.stroke();
    }
    // Units.
    this.units.forEach((u, i) => {
      if (u.dead) return;
      this.drawBand(u, t, i === this.sel, `${i + 1}`);
    });
    for (const e of this.enemies) if (!e.dead) this.drawBand(e, t, false, "");
    for (const a of this.arrows) {
      const x = a.x + (a.tx - a.x) * a.t;
      const y = a.y + (a.ty - a.y) * a.t - Math.sin(a.t * Math.PI) * 8;
      r(x, y, 2, 1, "#f4ecd8");
    }
    for (const f of this.fx) r(f.x, f.y, 1, 1, f.color);
  }

  /** A band of soldiers (or riders) around its banner, with an HP bar. */
  private drawBand(u: Unit, t: number, selected: boolean, label: string): void {
    const g = this.ctx;
    const r = (x: number, y: number, w: number, h: number, col: string) => {
      g.fillStyle = col;
      g.fillRect(Math.round(x), Math.round(y), w, h);
    };
    const boss = u.kind === "boss";
    const n = boss ? 9 : 7;
    const rad = boss ? 7 : 5;
    if (selected) {
      g.strokeStyle = PAL.sel;
      g.lineWidth = 1;
      g.beginPath();
      g.arc(u.x, u.y, rad + 4 + Math.sin(t * 6) * 0.8, 0, Math.PI * 2);
      g.stroke();
    }
    if (boss && u.windup && u.windup > 0) {
      g.strokeStyle = "#ff4030";
      g.beginPath();
      g.arc(u.x, u.y, rad + 6 + Math.sin(t * 30) * 1.5, 0, Math.PI * 2);
      g.stroke();
    }
    const mounted = u.kind === "cav" || u.kind === "guard" || boss;
    const body = u.flash > 0 ? PAL.white : u.color;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + 0.4;
      const bob = Math.sin(t * 8 + k) * 0.5;
      const x = u.x + Math.cos(a) * rad * (0.5 + (k % 2) * 0.5);
      const y = u.y + Math.sin(a) * rad * 0.7 * (0.5 + (k % 2) * 0.5) + bob;
      if (mounted) {
        r(x - 2, y, 4, 2, boss ? "#3a2a2a" : "#6a4a2a");
        r(x - 1, y - 2, 2, 2, body);
        if (boss) r(x - 1, y - 3, 2, 1, PAL.byzGold);
      } else {
        r(x - 1, y - 1, 2, 3, body);
        r(x - 1, y - 2, 2, 1, u.side === "o" ? "#f2ede2" : "#9a958c");
      }
    }
    // Banner.
    r(u.x, u.y - rad - 8, 1, 9, PAL.black);
    r(u.x + 1, u.y - rad - 8, boss ? 7 : 5, boss ? 4 : 3, u.side === "o" ? u.color : boss ? PAL.byzGold : PAL.byz);
    // HP bar.
    const w = boss ? 26 : 14;
    r(u.x - w / 2, u.y + rad + 3, w, 2, PAL.black);
    r(u.x - w / 2, u.y + rad + 3, Math.max(0, (u.hp / u.maxHp) * w), 2, u.side === "o" ? "#9fd26b" : "#e2655a");
    if (label) {
      g.font = "bold 6px monospace";
      g.textAlign = "center";
      g.fillStyle = selected ? PAL.sel : "#ffffff";
      g.fillText(label, u.x - 5, u.y - rad - 3);
    }
    if (boss) {
      g.font = "bold 6px monospace";
      g.textAlign = "center";
      g.fillStyle = "#ffe0a0";
      g.fillText("TEKFUR", u.x, u.y - rad - 10);
    }
  }

  private updateUi(): void {
    const m = clamp(this.morale, 0, 100);
    this.moraleFill.style.width = `${m}%`;
    setText(this.moraleTxt, `${Math.round(m)}`);
    const blk = this.gates.filter((g) => g.blockaded).length;
    const boss = this.boss;
    this.goals.innerHTML =
      this.phase === "boss" || this.phase === "won"
        ? `<div class="${this.phase === "won" ? "done" : "cur"}">Tekfur'un hücumunu kır${boss ? ` · ${Math.max(0, Math.ceil((boss.hp / boss.maxHp) * 100))}%` : ""}</div><div class="done">Hisarın direnci kırıldı</div>`
        : `<div class="${blk === 4 ? "done" : "cur"}">Kapıları kuşat: <b>${blk}/4</b></div><div class="cur">İkmal kafilelerini kes: <b>${this.cut}</b></div><div class="cur">Direnci ${CFG.bossAt}'a düşür</div>`;
    this.cards.forEach((c, i) => {
      const u = this.units[i];
      c.root.classList.toggle("sel", i === this.sel);
      c.root.classList.toggle("dead", u.dead);
      c.hp.style.width = `${(u.hp / u.maxHp) * 100}%`;
      const gate = this.gates.find((g) => Math.hypot(u.x - g.x, u.y - g.y) < 28);
      setText(c.state, u.dead ? (i === 0 ? "geri çekildi" : `toparlanıyor ${Math.ceil(u.respawn)}`) : this.nearest(u, this.enemies, u.range + 4) ? "çarpışıyor" : gate ? gate.name.replace(" Kapısı", " k.") : Math.hypot(u.ax - u.x, u.ay - u.y) > 3 ? "yolda" : "bekliyor");
    });
  }

  protected onEnd(): void {
    const { player, mobile, hud } = this.d;
    for (const d of this.disposers) d();
    this.disposers = [];
    player.controlEnabled = true;
    player.lookEnabled = true;
    mobile.setLayout("explore");
    hud.setCrosshair(true);
  }

  /** QA helper for the test bot. */
  get qa(): {
    phase: string;
    morale: number;
    units: { x: number; y: number; hp: number; dead: boolean }[];
    gates: { x: number; y: number; hx: number; hy: number; blockaded: boolean }[];
    boss: { x: number; y: number; hp: number } | null;
  } {
    return {
      phase: this.phase,
      morale: this.morale,
      units: this.units.map((u) => ({ x: u.x, y: u.y, hp: u.hp, dead: u.dead })),
      gates: this.gates.map((g) => ({ x: g.x, y: g.y, hx: g.hx, hy: g.hy, blockaded: g.blockaded })),
      boss: this.boss && !this.boss.dead ? { x: this.boss.x, y: this.boss.y, hp: this.boss.hp } : null,
    };
  }
}
