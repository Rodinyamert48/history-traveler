import { Vector3, type TransformNode } from "@babylonjs/core";
import type { AudioManager } from "../audio/AudioManager";
import { GAME_CONFIG } from "../config/gameConfig";
import type { InputManager } from "../core/InputManager";
import type { NPC } from "../entities/NPC";
import type { Player } from "../entities/Player";
import type { HUD } from "../ui/HUD";
import type { MobileControls } from "../ui/MobileControls";
import { el, setText } from "../ui/dom";
import { clamp, lerp } from "../utils/math";
import { asciiBar, BaseMinigame } from "./BaseMinigame";

const CFG = GAME_CONFIG.minigames.kapi;

export interface KapiMinigameDeps {
  layer: HTMLElement;
  input: InputManager;
  audio: AudioManager;
  hud: HUD;
  mobile: MobileControls;
  player: Player;
  stand: Vector3;
  facing: number;
  /** Where carts stop outside the barrier, where they come from and where they go. */
  cartStop: Vector3;
  cartFrom: Vector3;
  cartTo: { bursa: Vector3; hisar: Vector3; back: Vector3 };
  carts: TransformNode[];
  /** Cart drivers walking beside the carts (one per cart node). */
  drivers: NPC[];
  groundY: (x: number, z: number) => number;
}

type Dest = "hisar" | "bursa" | "koy";

interface Traveller {
  driver: string;
  from: string;
  dest: Dest;
  declared: string;
  actual: string;
  seal: boolean;
  /** The right call, and why. */
  allow: boolean;
  why: string;
}

const DEST_LABEL: Record<Dest, string> = {
  hisar: "Balabancık Hisarı (içeri)",
  bursa: "Bursa (Tekfur'un şehri)",
  koy: "Köyüne dönüyor",
};

/** The day's travellers on the Bursa road. */
const TRAVELLERS: Traveller[] = [
  { driver: "Köylü Ali", from: "İnegöl", dest: "hisar", declared: "Arpa — atlar için", actual: "Arpa çuvalları", seal: true, allow: true, why: "Mühürlü, yük beyan edildiği gibi." },
  { driver: "Rum tüccar Nikola", from: "Mudanya", dest: "bursa", declared: "Zeytinyağı küpleri", actual: "Zeytinyağı küpleri", seal: false, allow: false, why: "Bursa kuşatmada: şehre hiçbir yük geçmez." },
  { driver: "Yörük Mehmet", from: "Domaniç yaylası", dest: "hisar", declared: "Odun", actual: "Odun", seal: false, allow: false, why: "Hisara girecek yükte Orhan Bey'in mührü olmalı." },
  { driver: "Değirmenci Hasan", from: "Yenişehir", dest: "hisar", declared: "Un", actual: "Un çuvalları — altında Tekfur'a mektuplar!", seal: true, allow: false, why: "Yük beyanla uyuşmuyor: gizli mektuplar." },
  { driver: "Çoban Veli", from: "Hisar ağılı", dest: "koy", declared: "Boş araba", actual: "Boş araba", seal: false, allow: true, why: "Köyüne boş dönen arabaya engel yok." },
  { driver: "Keşiş Theodoros", from: "Gemlik", dest: "bursa", declared: "Dua kitapları", actual: "Buğday çuvalları", seal: false, allow: false, why: "Bursa'ya erzak kaçırıyor — hem de yalan beyanla." },
  { driver: "Akıncı Bali", from: "Yenişehir", dest: "hisar", declared: "Ok ve yay", actual: "Ok demetleri, yaylar", seal: true, allow: true, why: "Mühürlü, cephane beyan edildiği gibi." },
  { driver: "Kasap Yusuf", from: "İnegöl", dest: "hisar", declared: "Altı baş kuzu — mutfak için", actual: "Altı baş kuzu", seal: true, allow: true, why: "Mühürlü; bu akşamın çevirmesi geldi!" },
];

type CartPhase = "arrive" | "wait" | "leave" | "gone";

interface Mover {
  node: TransformNode;
  driver?: NPC;
  path: Vector3[];
  seg: number;
  segT: number;
  t: number;
  walking: boolean;
}

/**
 * MINIGAME — "Kapı Nöbeti".
 * The fort guards the road to Bursa, which is under blockade. Carts come to the gate one by one;
 * open the load (E), ask for Orhan Bey's seal (Q), then let it pass (D/→) or send it back (A/←).
 * Nothing goes on to Bursa, nothing enters the fort without the seal, and the load must match
 * what was declared. Enough right calls and the blockade holds.
 */
export class KapiMinigame extends BaseMinigame {
  private idx = 0;
  private correct = 0;
  private wrong = 0;
  private opened = false;
  private asked = false;
  private phase: CartPhase = "arrive";
  private t = 0;
  /** The cart coming to (or waiting at) the gate, and the one driving off. */
  private cur?: Mover;
  private leaving: Mover | null = null;
  private nextIn = 0;
  private endT = 0;
  private won = false;
  private card!: HTMLDivElement;
  private feedback!: HTMLDivElement;
  private bar!: HTMLDivElement;
  private ascii!: HTMLDivElement;
  private pct!: HTMLSpanElement;
  private stats!: HTMLDivElement;

  constructor(private readonly d: KapiMinigameDeps) {
    super(d.layer);
  }

  protected onStart(): void {
    const { player, mobile, hud, stand, facing } = this.d;
    player.controlEnabled = false;
    player.lookEnabled = false;
    player.position.set(stand.x, stand.y, stand.z);
    player.yaw = facing;
    player.pitch = 0.06;
    mobile.setActionButtons([
      { label: "YÜKÜ AÇ", action: "interact" },
      { label: "MÜHÜR", action: "aimDown" },
      { label: "GERİ ÇEVİR", action: "left" },
      { label: "İZİN VER", action: "right" },
    ]);
    mobile.setLayout("action");
    hud.setCrosshair(false);
    this.idx = 0;
    this.correct = 0;
    this.wrong = 0;
    this.endT = 0;
    this.won = false;
    this.leaving = null;
    this.cur = undefined;
    this.d.carts.forEach((c) => c.setEnabled(false));
    this.d.drivers.forEach((n) => (n.visible = false));
    this.buildUi();
    this.sendCart();
  }

  private buildUi(): void {
    const u = this.ui;
    this.feedback = el("div", "rhythm-feedback high long", u);
    this.card = el("div", "kapi-card", u);
    const rules = el("div", "kapi-rules", u);
    rules.innerHTML =
      "<b>NÖBET EMRİ</b><ol><li>Bursa kuşatmada: şehre <b>hiçbir</b> yük geçmez.</li><li>Hisara girecek yükte Orhan Bey'in <b>mührü</b> olmalı.</li><li>Yük, beyan edilenle <b>aynı</b> olmalı.</li><li>Köyüne boş dönen yolcuya dokunma.</li></ol>";
    const panel = el("div", "mg-panel", u);
    const r = el("div", "mg-row", panel);
    el("div", "mg-title", r, "KAPI NÖBETİ");
    this.pct = el("span", "mg-value", r, "0%");
    const bar = el("div", "mg-bar", panel);
    this.bar = el("div", "mg-bar-fill wheat", bar);
    this.ascii = el("div", "mg-ascii", panel, asciiBar(0));
    this.stats = el("div", "mg-stats", panel);
    el(
      "div",
      "hint-line",
      panel,
      this.d.input.isTouch
        ? "YÜKÜ AÇ · MÜHÜR sor · sonra İZİN VER ya da GERİ ÇEVİR"
        : "E: yükü aç · Q: mührü sor · D/→: izin ver · A/←: geri çevir · F: bırak",
    );
    this.updateUi();
  }

  private showFeedback(text: string, color: string): void {
    this.feedback.innerHTML = text;
    this.feedback.style.color = color;
    this.feedback.classList.remove("show");
    void this.feedback.offsetWidth;
    this.feedback.classList.add("show");
  }

  private get tr(): Traveller | undefined {
    return TRAVELLERS[this.idx];
  }

  private sendCart(): void {
    const { cartFrom, cartStop, carts, drivers } = this.d;
    this.opened = false;
    this.asked = false;
    this.phase = "arrive";
    const node = carts[this.idx % carts.length];
    const driver = drivers[this.idx % drivers.length];
    this.cur = { node, driver, path: [cartFrom, new Vector3(cartFrom.x, 0, 7), cartStop], seg: 0, segT: 0, t: 0, walking: true };
    node.setEnabled(true);
    if (driver) driver.visible = true;
    this.placeCart(this.cur, cartFrom, Math.PI);
    this.d.audio.play("woodCreak", { volume: 0.4 });
    this.updateUi();
  }

  private placeCart(m: Mover, p: Vector3, heading: number): void {
    const { groundY } = this.d;
    m.node.position.set(p.x, groundY(p.x, p.z), p.z);
    m.node.rotation.y = heading;
    const drv = m.driver;
    if (drv) {
      // Walking at the ox's head, on the side facing the gate.
      const s = Math.sin(heading);
      const co = Math.cos(heading);
      const x = p.x + co * 1.3 + s * 3.4;
      const z = p.z - s * 1.3 + co * 3.4;
      drv.place(x, groundY(x, z), z, heading);
      drv.anim = m.walking ? "walk" : "idle";
    }
  }

  /** Moves a cart along its path; returns true when it reached the end. */
  private advance(m: Mover, dt: number): boolean {
    m.t += dt;
    const a = m.path[m.seg];
    const b = m.path[m.seg + 1];
    if (!b) return true;
    const len = Math.max(0.01, Math.hypot(b.x - a.x, b.z - a.z));
    m.segT += (CFG.cartSpeed * dt) / len;
    if (m.segT >= 1) {
      m.seg++;
      m.segT = 0;
      if (m.seg >= m.path.length - 1) {
        this.placeCart(m, b, Math.atan2(b.x - a.x, b.z - a.z));
        return true;
      }
      return false;
    }
    const p = new Vector3(lerp(a.x, b.x, m.segT), 0, lerp(a.z, b.z, m.segT));
    this.placeCart(m, p, Math.atan2(b.x - a.x, b.z - a.z));
    return false;
  }

  private decide(allow: boolean): void {
    const tr = this.tr!;
    const { audio, cartStop, cartTo } = this.d;
    const right = allow === tr.allow;
    if (right) this.correct++;
    else this.wrong++;
    audio.play(right ? "good" : "miss", { volume: 0.5 });
    this.showFeedback(`${right ? "DOĞRU KARAR" : "YANLIŞ KARAR"}<small>${tr.why}</small>`, right ? "#9fd26b" : "#e2655a");
    // Off it goes: on its way if allowed, back up the road if not; the next cart follows.
    const road = new Vector3(this.d.cartFrom.x, 0, -6);
    let path: Vector3[];
    if (allow && tr.dest === "hisar") path = [cartStop, cartTo.hisar];
    else if (allow && tr.dest === "bursa") path = [cartStop, road, cartTo.bursa];
    else path = [cartStop, new Vector3(road.x, 0, 7), cartTo.back];
    if (this.leaving) this.retire(this.leaving);
    const m = this.cur!;
    this.leaving = { ...m, path, seg: 0, segT: 0, t: 0, walking: true };
    this.cur = undefined;
    this.phase = "leave";
    this.nextIn = 1.6;
    audio.play("woodCreak", { volume: 0.35, pitch: 0.9 });
    this.idx++;
    if (this.correct >= CFG.needed && this.idx >= TRAVELLERS.length) this.end(true);
    else if (this.wrong > TRAVELLERS.length - CFG.needed) this.end(false);
    else if (this.idx >= TRAVELLERS.length) this.end(this.correct >= CFG.needed);
    this.updateUi();
  }

  private retire(m: Mover): void {
    m.node.setEnabled(false);
    if (m.driver) m.driver.visible = false;
  }

  protected update(dt: number): void {
    const { input, player, audio } = this.d;
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
    this.t += dt;
    if (this.leaving && (this.advance(this.leaving, dt) || this.leaving.t > 12)) {
      this.retire(this.leaving);
      this.leaving = null;
    }
    if (this.phase === "leave") {
      this.nextIn -= dt;
      if (this.nextIn <= 0) this.sendCart();
    } else if (this.phase === "arrive" && this.cur) {
      if (this.advance(this.cur, dt)) {
        this.phase = "wait";
        this.cur.walking = false;
        this.placeCart(this.cur, this.d.cartStop, Math.PI / 2);
        audio.play("woodKnock", { volume: 0.4 });
        this.updateUi();
      }
    } else if (this.phase === "wait") {
      if (input.wasPressed("interact") && !this.opened) {
        this.opened = true;
        audio.play("woodCreak", { volume: 0.5, pitch: 1.3 });
        this.updateUi();
      }
      if (input.wasPressed("aimDown") && !this.asked) {
        this.asked = true;
        audio.play("penScratch", { volume: 0.4 });
        this.updateUi();
      }
      if (input.wasPressed("right")) this.decide(true);
      else if (input.wasPressed("left")) this.decide(false);
    }
    // Look out through the gate, following the cart a little.
    const c = this.cur?.node.position ?? this.d.cartStop;
    const yaw = Math.atan2(c.x - player.position.x, c.z - player.position.z);
    player.yaw = lerp(player.yaw, clamp(yaw, this.d.facing - 0.3, this.d.facing + 0.3), clamp(dt * 3, 0, 1));
    player.pitch = lerp(player.pitch, 0.08, clamp(dt * 3, 0, 1));
    player.syncCamera(dt, 0);
  }

  private end(won: boolean): void {
    this.won = won;
    this.endT = 0.001;
    this.phase = "gone";
    this.d.audio.play(won ? "objective" : "miss", { volume: 0.8 });
    this.showFeedback(won ? "KUŞATMA SIKI — YOL TUTULDU!" : "ÇOK HATA — NÖBETİ BAŞTAN AL", won ? "#9fd26b" : "#e2655a");
  }

  private updateUi(): void {
    const tr = this.tr;
    if (tr && this.phase !== "gone") {
      const waiting = this.phase === "wait";
      const sealTxt = !this.asked ? "<i>? (Q: sor)</i>" : tr.seal ? "<b class='ok'>Var — Orhan Bey'in tuğrası</b>" : "<b class='bad'>Yok</b>";
      const loadTxt = !this.opened ? "<i>? (E: yükü aç)</i>" : `<b class='${tr.actual === tr.declared || tr.actual.startsWith(tr.declared) ? "" : "warn"}'>${tr.actual}</b>`;
      this.card.innerHTML = `
        <div class="kc-head">${this.idx + 1}. ARABA ${waiting ? "" : "<span>geliyor…</span>"}</div>
        <div class="kc-row"><span>Sürücü</span><b>${tr.driver}</b></div>
        <div class="kc-row"><span>Nereden</span><b>${tr.from}</b></div>
        <div class="kc-row"><span>Nereye</span><b>${DEST_LABEL[tr.dest]}</b></div>
        <div class="kc-row"><span>Beyan</span><b>${tr.declared}</b></div>
        <div class="kc-row"><span>Mühür</span>${sealTxt}</div>
        <div class="kc-row"><span>Yük</span>${loadTxt}</div>`;
      this.card.classList.toggle("dim", !waiting);
    }
    const k = Math.min(1, this.correct / CFG.needed);
    this.bar.style.width = `${(k * 100).toFixed(1)}%`;
    setText(this.ascii, asciiBar(k));
    setText(this.pct, `${Math.round(k * 100)}%`);
    this.stats.innerHTML = `Doğru: <b>${this.correct}</b>/${CFG.needed} · Yanlış: <b>${this.wrong}</b> · Araba: <b>${Math.min(this.idx + 1, TRAVELLERS.length)}</b>/${TRAVELLERS.length}`;
  }

  protected onEnd(): void {
    const { player, mobile, hud } = this.d;
    player.controlEnabled = true;
    player.lookEnabled = true;
    mobile.setLayout("explore");
    hud.setCrosshair(true);
    this.d.carts.forEach((c) => c.setEnabled(false));
    this.d.drivers.forEach((n) => (n.visible = false));
  }

  /** QA helper for the test bot. */
  get qa(): { phase: CartPhase; idx: number; allow: boolean | null; correct: number } {
    return { phase: this.phase, idx: this.idx, allow: this.tr ? this.tr.allow : null, correct: this.correct };
  }
}
