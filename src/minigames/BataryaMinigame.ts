import { Color4, Matrix, Vector3, type Scene } from "@babylonjs/core";
import type { AudioManager } from "../audio/AudioManager";
import { GAME_CONFIG } from "../config/gameConfig";
import type { InputManager } from "../core/InputManager";
import type { NPC } from "../entities/NPC";
import type { Player } from "../entities/Player";
import type { CanakkaleFleet, FleetShip } from "../scenarios/canakkale/CanakkaleFleet";
import type { BatteryGun } from "../scenarios/canakkale/CanakkaleWorld";
import type { CameraFX } from "../systems/CameraFX";
import type { ParticleFX } from "../systems/ParticleFX";
import type { HUD } from "../ui/HUD";
import type { MobileControls } from "../ui/MobileControls";
import { el, setText } from "../ui/dom";
import { clamp, lerp } from "../utils/math";
import { Random } from "../utils/random";
import { asciiBar, BaseMinigame } from "./BaseMinigame";

const CFG = GAME_CONFIG.minigames.batarya;

export interface BataryaMinigameDeps {
  layer: HTMLElement;
  input: InputManager;
  audio: AudioManager;
  hud: HUD;
  mobile: MobileControls;
  player: Player;
  scene: Scene;
  fx: ParticleFX;
  camFx: CameraFX;
  stand: Vector3;
  facing: number;
  gun: BatteryGun;
  fleet: CanakkaleFleet;
  crew: NPC[];
  /** "first": the morning's long-range duel; "final": 18 March afternoon, the French line comes in. */
  mode: "first" | "final";
}

interface Shot {
  t: number;
  flight: number;
  at: Vector3;
  range: number;
  generous: boolean;
}

/** Displayed ranges are the (compressed) game distances × this. */
const RANGE_SCALE = 10;

/**
 * MINIGAME — "Mecidiye Tabyası'nın Topu".
 * Lay the 24 cm Krupp gun on the battleships in the strait: traverse with the mouse, set the
 * range (W/S, wheel; Q/E fine) to what the rangefinder officer calls out, and fire. The shell
 * takes seconds to arrive, so lead the moving ship; splashes tell you short, long, left or
 * right. In the final the fleet fires back at the battery — keep it fighting until the French
 * line turns into Erenköy Bay.
 */
export class BataryaMinigame extends BaseMinigame {
  private range = 500;
  private reload = 0;
  private shots: Shot[] = [];
  private hits = 0;
  private fired = 0;
  private integrity = 100;
  private recoil = 0;
  private endT = 0;
  private won = false;
  private script = -1;
  private scriptT = 0;
  private rnd = new Random(1803);
  private feedback!: HTMLDivElement;
  private rangeEl!: HTMLDivElement;
  private callEl!: HTMLDivElement;
  private reloadFill!: HTMLDivElement;
  private bar!: HTMLDivElement;
  private ascii!: HTMLDivElement;
  private pct!: HTMLSpanElement;
  private stats!: HTMLDivElement;
  private integrityRow!: HTMLDivElement;
  private integrityFill!: HTMLDivElement;
  private labels = new Map<FleetShip, HTMLDivElement>();
  private labelLayer!: HTMLDivElement;
  private prevIncoming: ((at: Vector3, dist: number) => void) | null = null;

  constructor(private readonly d: BataryaMinigameDeps) {
    super(d.layer);
  }

  private get goal(): number {
    return this.d.mode === "first" ? CFG.firstHits : CFG.finalHits;
  }

  protected onStart(): void {
    const { player, mobile, hud, stand, facing, fleet, mode, audio } = this.d;
    player.controlEnabled = false;
    player.lookEnabled = true;
    player.position.set(stand.x, stand.y + 1.05, stand.z);
    player.yaw = facing + 0.2;
    player.pitch = 0.03;
    player.yawLimit = { center: facing + 0.2, range: 0.62 };
    player.pitchLimit = { min: -0.12, max: 0.25 };
    mobile.setActionButtons([
      { label: "ATEŞ", action: "fire" },
      { label: "MESAFE +", action: "forward" },
      { label: "MESAFE −", action: "back" },
      { label: "BIRAK", action: "action" },
    ]);
    mobile.setLayout("action");
    hud.setCrosshair(true);
    this.range = 500;
    this.reload = 0;
    this.shots = [];
    this.hits = 0;
    this.fired = 0;
    this.integrity = 100;
    this.endT = 0;
    this.won = false;
    this.script = -1;
    fleet.prepare(mode);
    fleet.bombard = true;
    this.prevIncoming = fleet.onIncoming;
    fleet.onIncoming = (at, dist) => this.incoming(at, dist);
    for (const c of this.d.crew) c.setBehavior({ type: "pose", anim: "load" });
    this.buildUi();
    audio.playMusic("tension");
    if (mode === "final") this.showFeedback("SEYİT ONBAŞI'NIN MERMİSİ NAMLUDA!<small>İlk atış bu mermiyle — iyi nişan al.</small>", "#ffd36a");
  }

  private buildUi(): void {
    const u = this.ui;
    this.labelLayer = el("div", "bt-labels", u);
    this.feedback = el("div", "rhythm-feedback high long", u);
    const side = el("div", "bt-side", u);
    el("div", "bt-cap", side, "NİŞAN MESAFESİ");
    this.rangeEl = el("div", "bt-range", side);
    this.callEl = el("div", "bt-call", side);
    const rb = el("div", "bt-reload", side);
    this.reloadFill = el("div", "bt-reload-fill", rb);
    this.integrityRow = el("div", "bt-integrity", side);
    el("span", "", this.integrityRow, "TABYA");
    const it = el("div", "bt-int-track", this.integrityRow);
    this.integrityFill = el("div", "bt-int-fill", it);
    this.integrityRow.style.display = this.d.mode === "final" ? "" : "none";
    const panel = el("div", "mg-panel", u);
    const r = el("div", "mg-row", panel);
    el("div", "mg-title", r, this.d.mode === "first" ? "TABYA ATEŞTE" : "18 MART 1915");
    this.pct = el("span", "mg-value", r, "0%");
    const bar = el("div", "mg-bar", panel);
    this.bar = el("div", "mg-bar-fill fire", bar);
    this.ascii = el("div", "mg-ascii", panel, asciiBar(0));
    this.stats = el("div", "mg-stats", panel);
    el(
      "div",
      "hint-line",
      panel,
      this.d.input.isTouch
        ? "Sürükleyerek yönlendir · MESAFE +/− ile telemetrenin söylediği mesafeyi ayarla · gemi ilerliyor: önüne nişan al · ATEŞ"
        : "Fare: yön · W/S veya tekerlek: mesafe (Q/E ince) · Sol tık / SPACE: ateş · gemi ilerliyor: önüne nişan al · F: bırak",
    );
    this.updateUi();
  }

  private showFeedback(html: string, color: string): void {
    this.feedback.innerHTML = html;
    this.feedback.style.color = color;
    this.feedback.classList.remove("show");
    void this.feedback.offsetWidth;
    this.feedback.classList.add("show");
  }

  private gunPos(): Vector3 {
    return this.d.gun.yaw.getAbsolutePosition();
  }

  /** The ship nearest the line of fire (within a few degrees). */
  private sighted(): FleetShip | null {
    const g = this.gunPos();
    const yaw = this.d.player.yaw;
    let best: FleetShip | null = null;
    let bd = 0.09;
    for (const s of this.d.fleet.active) {
      const p = s.node.position;
      const a = Math.atan2(p.x - g.x, p.z - g.z);
      let da = a - yaw;
      da = Math.abs(Math.atan2(Math.sin(da), Math.cos(da)));
      const ang = Math.atan2(s.length / 2, Math.hypot(p.x - g.x, p.z - g.z));
      if (da - ang * 0.6 < bd) {
        bd = da - ang * 0.6;
        best = s;
      }
    }
    return best;
  }

  private fire(): void {
    const { audio, fx, camFx, gun, player } = this.d;
    if (this.reload > 0) {
      this.showFeedback("TOP DOLDURULUYOR…", "#f0b54a");
      return;
    }
    this.reload = CFG.reload;
    this.fired++;
    this.recoil = 1;
    const muzzle = gun.muzzle.getAbsolutePosition();
    const dir = new Vector3(Math.sin(player.yaw), 0.08, Math.cos(player.yaw)).normalize();
    fx.muzzleFlash(muzzle, dir);
    fx.cannonSmoke(muzzle, dir);
    fx.dustPuff(muzzle.add(new Vector3(0, -2, 0)), 14, new Color4(0.7, 0.62, 0.48, 0.7));
    audio.play("cannonFire", { volume: 1 });
    camFx.addTrauma(0.55);
    const g = this.gunPos();
    const at = new Vector3(g.x + Math.sin(player.yaw) * this.range, 0, g.z + Math.cos(player.yaw) * this.range);
    this.shots.push({ t: 0, flight: 1.1 + this.range / CFG.shellSpeed, at, range: this.range, generous: this.d.mode === "final" && this.fired === 1 });
    for (const c of this.d.crew) c.anim = "load";
  }

  private land(s: Shot): void {
    const { fx, audio, fleet } = this.d;
    const g = this.gunPos();
    let best: FleetShip | null = null;
    let bestScore = Infinity;
    let feedback = "";
    for (const ship of fleet.active) {
      const p = ship.node.position;
      const ax = Math.sin(ship.heading);
      const az = Math.cos(ship.heading);
      const dx = s.at.x - p.x;
      const dz = s.at.z - p.z;
      const lon = Math.abs(dx * ax + dz * az);
      const lat = Math.abs(dx * az - dz * ax);
      const k = s.generous ? 2.6 : 1;
      const lonTol = (ship.length / 2 + CFG.slack) * k;
      const latTol = (ship.beam / 2 + CFG.slack) * k;
      const score = lon / lonTol + lat / latTol;
      if (lon <= lonTol && lat <= latTol && score < bestScore) {
        bestScore = score;
        best = ship;
      }
    }
    if (best) {
      this.hits++;
      const out = fleet.hit(best);
      audio.play("impactStone", { volume: 0.5, pitch: 0.7 });
      window.setTimeout(() => this.active && audio.play("cheer", { volume: 0.35 }), 500);
      this.showFeedback(out ? `İSABET! ${best.name.toUpperCase()}<small>Ağır yara aldı — hattan çekiliyor!</small>` : `İSABET! ${best.name.toUpperCase()}`, "#9fd26b");
      if (this.hits >= this.goal) this.reachGoal();
      this.updateUi();
      return;
    }
    // A miss: a tall column of water and a correction.
    for (let k = 0; k < 3; k++) fx.splash(s.at.add(new Vector3(this.rnd.range(-3, 3), 0, this.rnd.range(-3, 3))));
    audio.play("splash", { volume: 0.4 });
    const target = this.nearestTo(s.at);
    if (target) {
      const p = target.node.position;
      const rT = Math.hypot(p.x - g.x, p.z - g.z);
      const bearT = Math.atan2(p.x - g.x, p.z - g.z);
      const bearS = Math.atan2(s.at.x - g.x, s.at.z - g.z);
      let db = bearS - bearT;
      db = Math.atan2(Math.sin(db), Math.cos(db));
      const lateral = db * rT;
      if (Math.abs(lateral) > target.length / 2 + CFG.slack) feedback = lateral > 0 ? "SAĞA DÜŞTÜ" : "SOLA DÜŞTÜ";
      if (s.range < rT - (target.beam / 2 + CFG.slack)) feedback = feedback ? `KISA · ${feedback}` : "KISA DÜŞTÜ";
      else if (s.range > rT + (target.beam / 2 + CFG.slack)) feedback = feedback ? `UZUN · ${feedback}` : "UZUN DÜŞTÜ";
      if (!feedback) feedback = "ISKA — GEMİNİN ÖNÜNE NİŞAN AL";
    } else feedback = "ISKA";
    this.showFeedback(feedback, "#f0b54a");
  }

  private nearestTo(p: Vector3): FleetShip | null {
    let best: FleetShip | null = null;
    let bd = Infinity;
    for (const s of this.d.fleet.active) {
      const d = Vector3.Distance(s.node.position, p);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  /** A shell from the fleet lands near the battery. */
  private incoming(at: Vector3, dist: number): void {
    const { fx, audio, camFx, player } = this.d;
    const y = this.d.stand.y;
    const p = new Vector3(at.x, y, at.z);
    // Bursts on the hillside or in the water below.
    if (Math.hypot(at.x - player.position.x, at.z - player.position.z) > 12) fx.impact(p, dist < 40);
    else fx.dustPuff(p, 20);
    audio.play("impactStone", { volume: clamp(1.2 - dist / 90, 0.2, 0.9), pitch: 0.6 });
    camFx.addTrauma(clamp(0.6 - dist / 120, 0.08, 0.5));
    if (this.d.mode !== "final" || this.endT) return;
    if (dist < CFG.nearMiss) {
      const floor = this.script >= 0 ? 10 : 0;
      this.integrity = Math.max(floor, this.integrity - CFG.damage);
      this.showFeedback("TABYAYA İSABET!", "#e2655a");
      if (this.integrity <= 0) this.end(false);
      this.updateUi();
    }
  }

  private reachGoal(): void {
    if (this.d.mode === "first") {
      this.end(true);
      return;
    }
    if (this.script < 0) {
      this.script = 0;
      this.scriptT = 0;
    }
  }

  /**
   * The afternoon of 18 March: the French line turns into Erenköy Bay, where Nusret laid her
   * mines ten days before; Bouvet, then Irresistible and Ocean strike them.
   */
  private runScript(dt: number): void {
    const { fleet, audio } = this.d;
    this.scriptT += dt;
    const t = this.scriptT;
    switch (this.script) {
      case 0:
        fleet.toMines("bouvet");
        this.showFeedback("BOUVET ERENKÖY KOYUNA DÖNÜYOR!<small>Nusret'in döşediği mayın hattına doğru…</small>", "#ffd36a");
        this.script = 1;
        break;
      case 1:
        // Waiting for Bouvet to reach the minefield (onMine moves the script on).
        break;
      case 2:
        if (t >= 10) {
          fleet.toMines("irresistible");
          this.showFeedback("IRRESISTIBLE DE KOYA GİRİYOR!", "#ffd36a");
          this.script = 3;
        }
        break;
      case 3:
        if (t >= 24) {
          fleet.toMines("ocean");
          this.script = 4;
        }
        break;
      case 4:
        if (t >= 46) {
          fleet.retreatAll();
          fleet.bombard = false;
          audio.play("fanfare", { volume: 0.7 });
          this.showFeedback("DÜŞMAN DONANMASI ÇEKİLİYOR!<small>18 Mart 1915 — Çanakkale geçilmez!</small>", "#9fd26b");
          this.script = 5;
        }
        break;
      case 5:
        if (t >= 52) this.end(true);
        break;
    }
  }

  private onMine(ship: FleetShip): void {
    if (!this.active) return;
    const txt: Record<string, string> = {
      bouvet: "BOUVET MAYINA ÇARPTI!<small>Nusret'in mayınları — dakikalar içinde batıyor.</small>",
      irresistible: "IRRESISTIBLE MAYINA ÇARPTI!",
      ocean: "OCEAN DA MAYINA ÇARPTI!",
    };
    this.showFeedback(txt[ship.id] ?? `${ship.name.toUpperCase()} MAYINA ÇARPTI!`, "#9fd26b");
    this.d.audio.play("cheer", { volume: 0.6 });
    if (ship.id === "bouvet" && this.script === 1) {
      this.script = 2;
      this.scriptT = 0;
    }
  }

  private end(won: boolean): void {
    if (this.endT) return;
    this.won = won;
    this.endT = 0.001;
    this.d.audio.play(won ? "objective" : "miss", { volume: 0.8 });
    if (this.d.mode === "first" && won) this.showFeedback("HEDEFLER YARALANDI!<small>Birinci hat geri çekiliyor.</small>", "#9fd26b");
    if (!won) this.showFeedback("TABYA SUSTURULDU<small>Toparlanıp yeniden ateşe…</small>", "#e2655a");
  }

  protected update(dt: number): void {
    const { input, player, gun, fleet, camFx } = this.d;
    if (this.endT) {
      this.endT += dt;
      player.updateLook();
      player.setShake(camFx.update(dt));
      player.syncCamera(dt, 0);
      this.updateLabels();
      if (this.endT > 3) this.finish(this.won);
      return;
    }
    if (input.wasPressed("action")) {
      this.finish(false);
      return;
    }
    if (fleet.onMine !== this.mineHandler) fleet.onMine = this.mineHandler;
    // Range setting.
    const speed = input.isDown("sprint") ? 70 : 28;
    if (input.isDown("forward")) this.range += speed * dt;
    if (input.isDown("back")) this.range -= speed * dt;
    if (input.wasPressed("aimUp")) this.range += 5;
    if (input.wasPressed("aimDown")) this.range -= 5;
    const wheel = input.consumeWheel();
    if (wheel) this.range -= wheel * 10;
    this.range = clamp(this.range, CFG.minRange, CFG.maxRange);
    this.reload = Math.max(0, this.reload - dt);
    if ((input.wasPressed("fire") || input.wasPressed("jump")) && !this.endT) this.fire();
    // Shells in flight.
    this.shots = this.shots.filter((s) => {
      s.t += dt;
      if (s.t < s.flight) return true;
      this.land(s);
      return false;
    });
    if (this.script >= 0) this.runScript(dt);
    // The gun follows the layer's aim.
    player.updateLook();
    gun.yaw.rotation.y = player.yaw;
    const elev = 0.03 + (this.range / CFG.maxRange) * 0.16;
    gun.barrel.rotation.x = lerp(gun.barrel.rotation.x, -elev, clamp(dt * 6, 0, 1));
    this.recoil = Math.max(0, this.recoil - dt * 2.5);
    gun.barrel.position.z = -this.recoil * 0.8;
    if (this.recoil <= 0) for (const c of this.d.crew) if (c.anim === "load" && this.reload <= 0) c.anim = "guard";
    player.setShake(camFx.update(dt));
    player.syncCamera(dt, 0);
    this.updateUi();
    this.updateLabels();
  }

  private mineHandler = (s: FleetShip) => this.onMine(s);

  private updateLabels(): void {
    const { scene, fleet } = this.d;
    const cam = scene.activeCamera;
    const engine = scene.getEngine();
    if (!cam) return;
    const w = engine.getRenderWidth();
    const h = engine.getRenderHeight();
    const canvas = engine.getRenderingCanvas();
    const sx = (canvas?.clientWidth ?? w) / w;
    const sy = (canvas?.clientHeight ?? h) / h;
    const vp = cam.viewport.toGlobal(w, h);
    const tm = scene.getTransformMatrix();
    const sighted = this.sighted();
    for (const s of fleet.ships) {
      let label = this.labels.get(s);
      const show = s.state === "steaming" || s.state === "toMines" || s.state === "sinking" || s.state === "listing";
      if (!show) {
        if (label) label.style.display = "none";
        continue;
      }
      if (!label) {
        label = el("div", "bt-label", this.labelLayer);
        this.labels.set(s, label);
      }
      const p = s.node.position.add(new Vector3(0, 30, 0));
      const pr = Vector3.Project(p, Matrix.IdentityReadOnly, tm, vp);
      if (pr.z < 0 || pr.z > 1) {
        label.style.display = "none";
        continue;
      }
      label.style.display = "";
      label.style.left = `${pr.x * sx}px`;
      label.style.top = `${pr.y * sy}px`;
      const hp = s.state === "steaming" || s.state === "toMines" ? "■".repeat(Math.max(0, s.hp)) + "□".repeat(Math.max(0, s.maxHp - s.hp)) : s.state === "sinking" ? "BATIYOR" : "YARALI";
      label.innerHTML = s === sighted ? `<b>${s.name}</b><span>${hp}</span>` : `<i>${s.name}</i>`;
      label.classList.toggle("sel", s === sighted);
      label.classList.toggle("fr", s.nation === "Fransız");
    }
  }

  private updateUi(): void {
    const g = this.gunPos();
    setText(this.rangeEl, `${(Math.round((this.range * RANGE_SCALE) / 10) * 10).toLocaleString("tr-TR")} m`);
    const s = this.sighted();
    if (s) {
      const p = s.node.position;
      const r = Math.hypot(p.x - g.x, p.z - g.z) * RANGE_SCALE;
      // Which way it is crossing the line of fire.
      const yaw = this.d.player.yaw;
      const cross = Math.sin(s.heading - yaw);
      this.callEl.innerHTML = `TELEMETRE: <b>${s.name}</b> · ${(Math.round(r / 50) * 50).toLocaleString("tr-TR")} m <i>${cross > 0.3 ? "→ sağa gidiyor" : cross < -0.3 ? "← sola gidiyor" : "yaklaşıyor/uzaklaşıyor"}</i>`;
    } else this.callEl.innerHTML = "TELEMETRE: <i>hedef yok — namluyu bir gemiye çevir</i>";
    this.reloadFill.style.width = `${(1 - this.reload / CFG.reload) * 100}%`;
    this.reloadFill.classList.toggle("ready", this.reload <= 0);
    const k = Math.min(1, this.hits / this.goal);
    this.bar.style.width = `${(k * 100).toFixed(1)}%`;
    setText(this.ascii, asciiBar(k));
    setText(this.pct, `${Math.round(k * 100)}%`);
    this.stats.innerHTML = `İsabet: <b>${this.hits}</b>/${this.goal} · Atış: <b>${this.fired}</b>${this.d.mode === "final" ? ` · Tabya: <b>${Math.round(this.integrity)}%</b>` : ""}`;
    this.integrityFill.style.width = `${this.integrity}%`;
    this.integrityFill.classList.toggle("low", this.integrity < 35);
  }

  protected onEnd(): void {
    const { player, mobile, hud, fleet, gun } = this.d;
    player.controlEnabled = true;
    player.lookEnabled = true;
    player.yawLimit = null;
    player.pitchLimit = null;
    mobile.setLayout("explore");
    hud.setCrosshair(true);
    fleet.onIncoming = this.prevIncoming;
    fleet.onMine = null;
    gun.barrel.position.z = 0;
    for (const c of this.d.crew) c.setBehavior({ type: "pose", anim: "guard" });
    this.labels.clear();
  }

  /** QA helper for the test bot: lead solution for the nearest active ship. */
  get qa(): { mode: string; hits: number; reload: number; range: number; integrity: number; script: number; target: { yaw: number; range: number; name: string } | null } {
    const g = this.gunPos();
    let target: { yaw: number; range: number; name: string } | null = null;
    let bd = Infinity;
    for (const s of this.d.fleet.active) {
      const p0 = s.node.position;
      const r0 = Math.hypot(p0.x - g.x, p0.z - g.z);
      const flight = 1.1 + r0 / CFG.shellSpeed;
      const p = this.d.fleet.predict(s, flight);
      const r = Math.hypot(p.x - g.x, p.z - g.z);
      if (r < bd) {
        bd = r;
        target = { yaw: Math.atan2(p.x - g.x, p.z - g.z), range: r, name: s.name };
      }
    }
    return { mode: this.d.mode, hits: this.hits, reload: this.reload, range: this.range, integrity: this.integrity, script: this.script, target };
  }

  /** QA: set the aim directly. */
  qaAim(yaw: number, range: number): void {
    this.d.player.yaw = yaw;
    this.range = clamp(range, CFG.minRange, CFG.maxRange);
  }
}
