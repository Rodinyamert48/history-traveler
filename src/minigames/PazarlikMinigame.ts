import type { Vector3 } from "@babylonjs/core";
import type { AudioManager } from "../audio/AudioManager";
import { GAME_CONFIG } from "../config/gameConfig";
import type { InputManager } from "../core/InputManager";
import type { NPC } from "../entities/NPC";
import type { Player } from "../entities/Player";
import type { HUD } from "../ui/HUD";
import type { MobileControls } from "../ui/MobileControls";
import { el, escapeHtml, setText } from "../ui/dom";
import { clamp } from "../utils/math";
import { asciiBar, BaseMinigame } from "./BaseMinigame";

const CFG = GAME_CONFIG.minigames.pazarlik;

/** A buyer at the counter. `max` (their real limit) is never shown; their words hint at it. */
export interface Customer {
  name: string;
  origin: string;
  order: string;
  /** Official price set by the muhtesib (narh). */
  narh: number;
  /** Opening bid, the most they would pay, and how much they raise per round. */
  open: number;
  max: number;
  step: number;
  /** 0..1 — how much haggling they put up with. */
  patience: number;
  greet: string;
  /** Lines when the asked price is near / well above / far above their limit. */
  near: string;
  high: string;
  /** Said when they walk away and when the deal pleases both sides. */
  leave: string;
  thanks: string;
}

export interface PazarlikMinigameDeps {
  layer: HTMLElement;
  input: InputManager;
  audio: AudioManager;
  hud: HUD;
  mobile: MobileControls;
  player: Player;
  stand: Vector3;
  facing: number;
  customers: Customer[];
  /** Scene callbacks: reset the queue, walk a buyer to the counter, send them away. */
  reset(): void;
  approach(i: number): void;
  isReady(i: number): boolean;
  leave(i: number, happy: boolean): void;
  npc(i: number): NPC | null;
}

type Stage = "approach" | "haggle" | "result" | "summary";

/**
 * MINIGAME — "Pazarlığın Keşfi".
 * Five buyers come to the counter. Set your price (←/→ ±1, ↑/↓ ±5 akçe) and say it (SPACE),
 * accept their bid (Q) or offer a taste (E, once each). Every round costs patience; ask far
 * above what they can pay and they leave. A deal near the narh that leaves the buyer content
 * is the market's ideal: "alan razı, satan razı". The day's purse must reach the goal.
 */
export class PazarlikMinigame extends BaseMinigame {
  private index = 0;
  private stage: Stage = "approach";
  private stageTime = 0;
  private ask = 0;
  private offer = 0;
  private limit = 0;
  private patience = 1;
  private tasted = false;
  private purse = 0;
  private razi = 0;
  private itibar = 0;
  private sold = 0;
  private lastOutcome: "razi" | "sold" | "cheap" | "lost" = "sold";
  private card!: HTMLDivElement;
  private nameEl!: HTMLDivElement;
  private orderEl!: HTMLDivElement;
  private speech!: HTMLDivElement;
  private moodFill!: HTMLDivElement;
  private offerEl!: HTMLDivElement;
  private askEl!: HTMLDivElement;
  private purseEl!: HTMLDivElement;
  private feedback!: HTMLDivElement;
  private bar!: HTMLDivElement;
  private ascii!: HTMLDivElement;
  private pct!: HTMLSpanElement;
  private stats!: HTMLDivElement;
  private summary!: HTMLDivElement;

  constructor(private readonly d: PazarlikMinigameDeps) {
    super(d.layer);
  }

  protected onStart(): void {
    const { player, mobile, hud, stand, facing } = this.d;
    player.controlEnabled = false;
    player.lookEnabled = true;
    player.position.set(stand.x, stand.y, stand.z);
    player.yaw = facing;
    player.pitch = 0.24;
    player.yawLimit = { center: facing, range: 0.7 };
    player.pitchLimit = { min: -0.3, max: 0.5 };
    mobile.setActionButtons([
      { label: "−", action: "left" },
      { label: "+", action: "right" },
      { label: "SÖYLE", action: "jump" },
      { label: "KABUL", action: "aimDown" },
      { label: "İKRAM", action: "interact" },
    ]);
    mobile.setLayout("action");
    hud.setCrosshair(false);
    this.index = 0;
    this.purse = 0;
    this.razi = 0;
    this.itibar = 0;
    this.sold = 0;
    this.d.reset();
    this.buildUi();
    this.beginCustomer();
  }

  private get cur(): Customer {
    return this.d.customers[this.index];
  }

  private buildUi(): void {
    const u = this.ui;
    this.feedback = el("div", "rhythm-feedback high", u);
    this.card = el("div", "bazaar-card", u);
    this.nameEl = el("div", "bc-name", this.card);
    this.orderEl = el("div", "bc-order", this.card);
    this.speech = el("div", "bc-speech", this.card);
    const mood = el("div", "bc-mood", this.card);
    el("span", "bc-mood-label", mood, "Sabır");
    const track = el("div", "bc-mood-track", mood);
    this.moodFill = el("div", "bc-mood-fill", track);
    this.offerEl = el("div", "bc-offer", this.card);
    const price = el("div", "bazaar-price", u);
    el("div", "bp-label", price, "SENİN FİYATIN");
    this.askEl = el("div", "bp-value", price);
    el("div", "bp-keys", price, this.d.input.isTouch ? "− / + ile fiyatı ayarla" : "← → : ±1 akçe · ↑ ↓ : ±5 akçe");
    this.purseEl = el("div", "bazaar-purse", u);
    this.summary = el("div", "bazaar-summary", u);
    this.summary.style.display = "none";
    const panel = el("div", "mg-panel", u);
    const row = el("div", "mg-row", panel);
    el("div", "mg-title", row, "PAZARLIĞIN KEŞFİ");
    this.pct = el("span", "mg-value", row, "0%");
    const bar = el("div", "mg-bar", panel);
    this.bar = el("div", "mg-bar-fill wheat", bar);
    this.ascii = el("div", "mg-ascii", panel, asciiBar(0));
    this.stats = el("div", "mg-stats", panel);
    el(
      "div",
      "hint-line",
      panel,
      this.d.input.isTouch
        ? "SÖYLE: fiyatını söyle · KABUL: müşterinin teklifine razı ol · İKRAM: bir tadımlık ikram et (bir kez)"
        : "SPACE: fiyatını söyle · Q: müşterinin teklifini kabul et · E: tadımlık ikram (bir kez) · F: bırak",
    );
  }

  private showFeedback(text: string, color: string): void {
    this.feedback.textContent = text;
    this.feedback.style.color = color;
    this.feedback.classList.remove("show");
    void this.feedback.offsetWidth;
    this.feedback.classList.add("show");
  }

  private say(text: string): void {
    this.speech.innerHTML = `“${escapeHtml(text)}”`;
    this.d.audio.play("murmur", { volume: 0.55, pitch: 0.85 + Math.random() * 0.25 });
  }

  private pose(anim: "talk" | "point" | "bow" | "cheer" | "idle"): void {
    this.d.npc(this.index)?.setBehavior({ type: "pose", anim });
  }

  private beginCustomer(): void {
    const c = this.cur;
    this.stage = "approach";
    this.stageTime = 0;
    this.offer = c.open;
    this.limit = c.max;
    this.patience = c.patience;
    this.tasted = false;
    // Start a little above the narh: there is always room to haggle.
    this.ask = Math.round(c.narh * 1.25);
    this.nameEl.innerHTML = `${escapeHtml(c.name)} <span>${escapeHtml(c.origin)}</span>`;
    this.orderEl.innerHTML = `İstediği: <b>${escapeHtml(c.order)}</b> · Narh: <b>${c.narh} akçe</b>`;
    this.speech.textContent = "…";
    this.offerEl.innerHTML = "";
    this.card.classList.remove("show");
    this.d.approach(this.index);
  }

  private deal(price: number): void {
    const c = this.cur;
    const { audio } = this.d;
    this.purse += price;
    this.sold++;
    audio.play("coins", { volume: 0.8 });
    const fairForSeller = price >= Math.round(c.narh * 0.9);
    const content = this.patience >= 0.3 && price <= this.limit;
    if (fairForSeller && content) {
      this.razi++;
      this.itibar++;
      this.lastOutcome = "razi";
      this.say(c.thanks);
      this.showFeedback("ALAN RAZI, SATAN RAZI!", "#9fd26b");
      audio.play("perfect", { volume: 0.5 });
      this.pose("bow");
    } else if (!fairForSeller) {
      this.lastOutcome = "cheap";
      this.say("Bu fiyata mı? Allah bereket versin, sen bilirsin!");
      this.showFeedback(`UCUZA GİTTİ (${price} akçe)`, "#f0b54a");
      this.pose("cheer");
    } else {
      this.lastOutcome = "sold";
      this.say("Pahalı ama… neyse, al bakalım.");
      this.showFeedback(`SATILDI (${price} akçe)`, "#ffd36a");
      this.pose("idle");
    }
    this.toResult();
  }

  private lose(): void {
    const c = this.cur;
    this.itibar--;
    this.lastOutcome = "lost";
    this.say(c.leave);
    this.showFeedback("MÜŞTERİ KAÇTI!", "#e2655a");
    this.d.audio.play("miss", { volume: 0.5 });
    this.pose("point");
    this.toResult();
  }

  private toResult(): void {
    this.stage = "result";
    this.stageTime = 0;
  }

  /** The player names a price; the buyer answers. */
  private speak(): void {
    const c = this.cur;
    const { audio } = this.d;
    const ask = this.ask;
    if (ask <= this.offer) {
      this.deal(ask);
      return;
    }
    const over = (ask - this.limit) / c.narh;
    if (ask > c.narh * CFG.greedy) {
      this.patience -= 0.3;
      this.itibar--;
      this.say("Bu ne fahiş fiyat! Muhtesibe şikâyet ederim!");
      this.showFeedback("İTİBAR SARSILDI", "#e2655a");
      audio.play("miss", { volume: 0.4 });
      this.pose("point");
    } else if (ask <= this.limit) {
      // Within reach: close enough and they give in, otherwise they meet you halfway.
      this.patience -= CFG.patienceBase;
      if (ask - this.offer <= c.step) {
        this.say("Peki, peki… olsun bakalım!");
        this.deal(ask);
        return;
      }
      this.offer = Math.min(ask - 1, this.offer + c.step);
      this.say(c.near.replace("{x}", String(this.offer)));
      this.pose("talk");
    } else {
      this.patience -= CFG.patienceBase + CFG.patienceOver * over;
      this.offer = Math.min(this.limit, this.offer + c.step);
      this.say(over < 0.2 ? c.near.replace("{x}", String(this.offer)) : c.high.replace("{x}", String(this.offer)));
      this.pose(over < 0.2 ? "talk" : "point");
    }
    audio.play("uiClick", { volume: 0.3 });
    if (this.patience <= 0) this.lose();
  }

  private taste(): void {
    const c = this.cur;
    if (this.tasted) {
      this.showFeedback("BİR KEZ İKRAM EDİLİR", "#f0b54a");
      return;
    }
    this.tasted = true;
    this.limit += Math.round(c.narh * CFG.tasteBonus);
    this.patience = Math.min(1, this.patience + 0.2);
    this.purse -= 1;
    this.say("Mmm! Eline, emeğine sağlık. Hakikaten başka.");
    this.showFeedback("İKRAM — GÖNLÜ YUMUŞADI", "#9fd26b");
    this.d.audio.play("pickup", { volume: 0.4, pitch: 1.2 });
    this.pose("cheer");
  }

  protected update(dt: number): void {
    const { input, player } = this.d;
    this.stageTime += dt;
    player.updateLook();
    player.syncCamera(dt, 0);
    if (this.stage === "summary") {
      if (this.stageTime > 4.2) this.finish(this.purse >= CFG.goal);
      return;
    }
    if (input.wasPressed("action")) {
      this.finish(false);
      return;
    }
    if (this.stage === "approach") {
      if (this.d.isReady(this.index) || this.stageTime > 9) {
        this.stage = "haggle";
        this.stageTime = 0;
        this.card.classList.add("show");
        this.say(this.cur.greet);
        this.pose("talk");
      }
    } else if (this.stage === "haggle") {
      if (input.wasPressed("left")) this.ask = Math.max(1, this.ask - 1);
      if (input.wasPressed("right")) this.ask += 1;
      if (input.wasPressed("back")) this.ask = Math.max(1, this.ask - 5);
      if (input.wasPressed("forward")) this.ask += 5;
      if (input.wasPressed("jump") || input.wasPressed("fire")) this.speak();
      else if (input.wasPressed("aimDown")) this.deal(this.offer);
      else if (input.wasPressed("interact")) this.taste();
    } else if (this.stage === "result" && this.stageTime > 2.6) {
      this.d.leave(this.index, this.lastOutcome !== "lost");
      this.card.classList.remove("show");
      this.index++;
      if (this.index >= this.d.customers.length) this.showSummary();
      else this.beginCustomer();
    }
    this.updateUi();
  }

  private showSummary(): void {
    this.stage = "summary";
    this.stageTime = 0;
    const ok = this.purse >= CFG.goal;
    const stars = clamp(3 + this.itibar, 0, 5);
    this.summary.style.display = "";
    this.summary.innerHTML = `
      <div class="bs-title">${ok ? "KESE DOLDU" : "KESE YETMEDİ"}</div>
      <div class="bs-row">Kazanç: <b>${this.purse} akçe</b> / hedef ${CFG.goal}</div>
      <div class="bs-row">Alan razı, satan razı: <b>${this.razi}</b> alışveriş · Satış: <b>${this.sold}/${this.d.customers.length}</b></div>
      <div class="bs-row">İtibar: <b>${"★".repeat(stars)}${"☆".repeat(5 - stars)}</b></div>
      <div class="bs-note">${ok ? "Ahi Bekir Usta: “Kazancın helal, müşterin memnun. İşte ticaret budur.”" : "Ahi Bekir Usta: “Ya çok pahalı söyledin ya da malı yok pahasına verdin. Bir daha deneyelim.”"}</div>`;
    this.d.audio.play(ok ? "fanfare" : "miss", { volume: 0.6 });
  }

  private updateUi(): void {
    const c = this.cur;
    if (c) {
      setText(this.askEl, `${this.ask} akçe`);
      this.askEl.classList.toggle("greedy", this.ask > c.narh * CFG.greedy);
      this.askEl.classList.toggle("cheap", this.ask < c.narh * 0.9);
      this.offerEl.innerHTML = this.stage === "haggle" ? `Teklifi: <b>${this.offer} akçe</b>${this.tasted ? " · <i>ikram edildi</i>" : ""}` : "";
      const p = clamp(this.patience, 0, 1);
      this.moodFill.style.width = `${(p * 100).toFixed(0)}%`;
      this.moodFill.style.background = p > 0.55 ? "#7fb24a" : p > 0.3 ? "#d6a540" : "#c8402e";
    }
    this.purseEl.innerHTML = `Kese: <b>${this.purse}</b> / ${CFG.goal} akçe · Müşteri: <b>${Math.min(this.index + 1, this.d.customers.length)}/${this.d.customers.length}</b>`;
    const k = clamp(this.purse / CFG.goal, 0, 1);
    this.bar.style.width = `${(k * 100).toFixed(1)}%`;
    setText(this.ascii, asciiBar(k));
    setText(this.pct, `${Math.round(k * 100)}%`);
    this.stats.innerHTML = `Razı: <b>${this.razi}</b> · Satış: <b>${this.sold}</b> · İtibar: <b>${this.itibar >= 0 ? "+" : ""}${this.itibar}</b>`;
  }

  protected onEnd(): void {
    const { player, mobile, hud } = this.d;
    player.yawLimit = null;
    player.pitchLimit = null;
    player.controlEnabled = true;
    player.lookEnabled = true;
    mobile.setLayout("explore");
    hud.setCrosshair(true);
  }

  /** QA helper for the test bot. */
  get qa(): { stage: Stage; index: number; ask: number; offer: number; narh: number; max: number; purse: number; patience: number } {
    const c = this.cur ?? this.d.customers[this.d.customers.length - 1];
    return { stage: this.stage, index: this.index, ask: this.ask, offer: this.offer, narh: c.narh, max: this.limit, purse: this.purse, patience: this.patience };
  }
}
