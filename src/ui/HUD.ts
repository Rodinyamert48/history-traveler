import { el, escapeHtml, setText, setVisible } from "./dom";

/**
 * In-game FPS HUD. Layout per the design brief:
 *  top-left  → GÖREV (mission title + description)
 *  top-center→ HEDEF / OBJECTIVE (+ distance)
 *  bottom    → interaction prompts ("[E] Etkileşim")
 * plus crosshair, world waypoint, toasts, banners, damage flash and an optional FPS meter.
 * Every setter is change-detected so per-frame calls never touch the DOM needlessly.
 */
export class HUD {
  readonly root: HTMLDivElement;
  private mission: HTMLDivElement;
  private missionTitle: HTMLDivElement;
  private missionDesc: HTMLDivElement;
  private objective: HTMLDivElement;
  private objectiveText: HTMLDivElement;
  private objectiveDist: HTMLDivElement;
  private crosshair: HTMLDivElement;
  private interact: HTMLDivElement;
  private interactKey: HTMLSpanElement;
  private interactText: HTMLSpanElement;
  private holdWrap: HTMLDivElement;
  private holdFill: HTMLDivElement;
  private waypoint: HTMLDivElement;
  private waypointDist: HTMLDivElement;
  private toasts: HTMLDivElement;
  private nameplate: HTMLDivElement;
  private fps: HTMLDivElement;
  private flash: HTMLDivElement;
  readonly minigameLayer: HTMLDivElement;
  private lastWp = "";

  constructor(parent: HTMLElement) {
    this.root = el("div", "hud hidden", parent);
    this.minigameLayer = el("div", "", this.root);
    this.flash = el("div", "damage-flash", this.root);

    this.mission = el("div", "hud-mission hidden", this.root);
    el("div", "hud-label", this.mission, "Görev");
    this.missionTitle = el("div", "hud-mission-title", this.mission);
    this.missionDesc = el("div", "hud-mission-desc", this.mission);

    this.objective = el("div", "hud-objective hidden", this.root);
    el("div", "hud-label", this.objective, "Hedef");
    this.objectiveText = el("div", "hud-objective-text", this.objective);
    this.objectiveDist = el("div", "hud-objective-dist", this.objective);

    this.crosshair = el("div", "crosshair", this.root);

    this.interact = el("div", "hud-interact hidden", this.root);
    this.interactKey = el("span", "key", this.interact, "E");
    const textWrap = el("div", "", this.interact);
    this.interactText = el("span", "", textWrap);
    this.holdWrap = el("div", "hud-hold hidden", textWrap);
    this.holdFill = el("div", "hud-hold-fill", this.holdWrap);

    this.waypoint = el("div", "waypoint hidden", this.root);
    el("div", "wp-icon", this.waypoint);
    this.waypointDist = el("div", "wp-dist", this.waypoint);

    this.toasts = el("div", "hud-toasts", this.root);
    this.nameplate = el("div", "nameplate hidden", this.root);
    this.fps = el("div", "fps-counter hidden", this.root);
  }

  show(): void {
    this.root.classList.remove("hidden");
    this.root.style.opacity = "1";
  }

  hide(): void {
    this.root.classList.add("hidden");
  }

  setOpacity(o: number): void {
    this.root.style.opacity = String(o);
  }

  setMission(title: string | null, description = ""): void {
    setVisible(this.mission, !!title);
    if (title) {
      setText(this.missionTitle, title);
      setText(this.missionDesc, description);
    }
  }

  setObjective(text: string | null, pulse = false): void {
    setVisible(this.objective, !!text);
    if (text) {
      const changed = this.objectiveText.textContent !== text;
      setText(this.objectiveText, text);
      if (pulse && changed) {
        this.objective.classList.remove("pulse");
        void this.objective.offsetWidth;
        this.objective.classList.add("pulse");
      }
    }
  }

  setObjectiveDistance(meters: number | null): void {
    setText(this.objectiveDist, meters === null ? "" : `${Math.round(meters)} m`);
  }

  setCrosshair(visible: boolean, active = false): void {
    setVisible(this.crosshair, visible);
    this.crosshair.classList.toggle("active", active);
  }

  setInteraction(prompt: { key: string; text: string; hold?: number } | null): void {
    setVisible(this.interact, !!prompt);
    if (!prompt) return;
    setText(this.interactKey, prompt.key);
    setText(this.interactText, prompt.text);
    const hasHold = prompt.hold !== undefined;
    setVisible(this.holdWrap, hasHold);
    if (hasHold) this.holdFill.style.width = `${Math.round((prompt.hold ?? 0) * 100)}%`;
  }

  /** Screen-space waypoint marker; `offscreen` shows an edge arrow rotated toward it. */
  setWaypoint(wp: { x: number; y: number; distance: number; offscreen: boolean; angle: number } | null): void {
    if (!wp) {
      setVisible(this.waypoint, false);
      this.lastWp = "";
      return;
    }
    setVisible(this.waypoint, true);
    const key = `${Math.round(wp.x)}|${Math.round(wp.y)}|${wp.offscreen}|${Math.round(wp.angle)}`;
    if (key !== this.lastWp) {
      this.lastWp = key;
      this.waypoint.style.transform = `translate(${wp.x}px, ${wp.y}px) translate(-50%, -50%)`;
      this.waypoint.classList.toggle("offscreen", wp.offscreen);
      this.waypoint.style.setProperty("--wp-rot", `${wp.angle}deg`);
    }
    setText(this.waypointDist, `${Math.round(wp.distance)} m`);
  }

  /** Floating name tag above an important character (screen px), null hides it. */
  setNameplate(p: { name: string; role: string; x: number; y: number; opacity: number } | null): void {
    setVisible(this.nameplate, !!p);
    if (!p) return;
    const html = `<span class="np-name">${escapeHtml(p.name)}</span><span class="np-role">${escapeHtml(p.role)}</span>`;
    if (this.nameplate.innerHTML !== html) this.nameplate.innerHTML = html;
    this.nameplate.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`;
    this.nameplate.style.opacity = p.opacity.toFixed(2);
  }

  toast(text: string, kind: "info" | "success" = "info", ms = 3800): void {
    const t = el("div", `toast ${kind === "success" ? "success" : ""}`, this.toasts, escapeHtml(text));
    setTimeout(() => {
      t.style.transition = "opacity 0.4s";
      t.style.opacity = "0";
      setTimeout(() => t.remove(), 450);
    }, ms);
    while (this.toasts.children.length > 4) this.toasts.firstElementChild?.remove();
  }

  /** Large centred banner; banners queue so "completed" and the next "new mission" never overlap. */
  banner(label: string, title: string): void {
    this.bannerQueue.push([label, title]);
    if (this.bannerQueue.length === 1) this.showNextBanner();
  }

  private bannerQueue: [string, string][] = [];

  private showNextBanner(): void {
    const next = this.bannerQueue[0];
    if (!next) return;
    const b = el("div", "banner", this.root, `<div class="b-label">${escapeHtml(next[0])}</div><div class="b-title">${escapeHtml(next[1])}</div>`);
    // The next banner starts as this one fades out (the CSS animation runs 3.6 s).
    setTimeout(() => {
      this.bannerQueue.shift();
      this.showNextBanner();
    }, this.bannerQueue.length > 1 ? 2600 : 3600);
    setTimeout(() => b.remove(), 3700);
  }

  damageFlash(): void {
    this.flash.classList.add("on");
    requestAnimationFrame(() => requestAnimationFrame(() => this.flash.classList.remove("on")));
  }

  setFps(visible: boolean, text = ""): void {
    setVisible(this.fps, visible);
    if (visible) setText(this.fps, text);
  }
}
