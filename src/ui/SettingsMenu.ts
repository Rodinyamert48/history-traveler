import { GAME_CONFIG, QUALITY_LEVELS, type QualityLevel } from "../config/gameConfig";
import type { SaveManager, Settings } from "../core/SaveManager";
import { el } from "./dom";

type Tab = "graphics" | "audio" | "controls";

const QUALITY_LABELS: Record<QualityLevel, string> = { LOW: "DÜŞÜK", MEDIUM: "ORTA", HIGH: "YÜKSEK", ULTRA: "ULTRA" };

/**
 * Settings modal (Grafik / Ses / Kontroller). Every change is persisted immediately
 * through SaveManager, which broadcasts `settings:changed` so systems apply it live.
 */
export class SettingsMenu {
  readonly root: HTMLDivElement;
  private body: HTMLDivElement;
  private tab: Tab = "graphics";
  private tabs = new Map<Tab, HTMLButtonElement>();
  private onClose: (() => void) | null = null;

  constructor(
    parent: HTMLElement,
    private readonly save: SaveManager,
    private readonly getApiName: () => string,
    private readonly sfx: (name: "uiClick" | "uiHover" | "uiBack") => void,
  ) {
    this.root = el("div", "modal hidden", parent);
    const card = el("div", "modal-card", this.root);
    el("h2", "", card, "AYARLAR");
    el("div", "ornament-line", card);
    const tabs = el("div", "tabs", card);
    for (const [id, label] of [
      ["graphics", "GRAFİK"],
      ["audio", "SES"],
      ["controls", "KONTROLLER"],
    ] as const) {
      const b = el("button", "tab", tabs, label);
      b.addEventListener("click", () => {
        this.sfx("uiClick");
        this.setTab(id);
      });
      this.tabs.set(id, b);
    }
    this.body = el("div", "", card);
    const buttons = el("div", "modal-buttons", card);
    const close = el("button", "btn secondary", buttons, "Geri");
    close.addEventListener("click", () => {
      this.sfx("uiBack");
      this.hide();
    });
    this.root.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        this.hide();
      }
    });
  }

  get isOpen(): boolean {
    return !this.root.classList.contains("hidden");
  }

  show(onClose?: () => void): void {
    this.onClose = onClose ?? null;
    this.root.classList.remove("hidden");
    this.setTab(this.tab);
  }

  hide(): void {
    if (!this.isOpen) return;
    this.root.classList.add("hidden");
    const cb = this.onClose;
    this.onClose = null;
    cb?.();
  }

  private setTab(tab: Tab): void {
    this.tab = tab;
    for (const [id, b] of this.tabs) b.classList.toggle("active", id === tab);
    this.body.innerHTML = "";
    const s = this.save.settings;
    if (tab === "graphics") {
      this.segRow(
        "Kalite",
        QUALITY_LEVELS.map((q) => ({ value: q, label: QUALITY_LABELS[q] })),
        s.quality,
        (v) => this.update({ quality: v as QualityLevel }),
      );
      this.sliderRow("Çözünürlük Ölçeği", 50, 100, 5, Math.round(s.resolutionScale * 100), (v) => `${v}%`, (v) =>
        this.update({ resolutionScale: v / 100 }),
      );
      this.toggleRow("Gölgeler", s.shadows, (v) => this.update({ shadows: v }));
      this.toggleRow("Partiküller", s.particles, (v) => this.update({ particles: v }));
      this.toggleRow("Post Processing", s.postProcessing, (v) => this.update({ postProcessing: v }));
      this.toggleRow("FPS Göstergesi", s.showFps, (v) => this.update({ showFps: v }));
      this.segRow(
        "Render API",
        [
          { value: "auto", label: "OTOMATİK" },
          { value: "webgpu", label: "WEBGPU" },
          { value: "webgl", label: "WEBGL" },
        ],
        s.renderApi,
        (v) => this.update({ renderApi: v as Settings["renderApi"] }),
      );
      el(
        "div",
        "settings-note",
        this.body,
        `Aktif motor: <b>${this.getApiName()}</b>. Render API değişikliği bir sonraki açılışta uygulanır. Kalite ön ayarı; gölge çözünürlüğünü, SSAO, bloom, doku boyutu ve görüş mesafesini belirler.`,
      );
    } else if (tab === "audio") {
      const pct = (v: number) => `${v}%`;
      this.sliderRow("Ana Ses", 0, 100, 1, Math.round(s.masterVolume * 100), pct, (v) => this.update({ masterVolume: v / 100 }));
      this.sliderRow("Müzik", 0, 100, 1, Math.round(s.musicVolume * 100), pct, (v) => this.update({ musicVolume: v / 100 }));
      this.sliderRow("Efektler", 0, 100, 1, Math.round(s.sfxVolume * 100), pct, (v) => this.update({ sfxVolume: v / 100 }));
    } else {
      this.sliderRow(
        "Fare Hassasiyeti",
        GAME_CONFIG.input.minSensitivity * 100,
        GAME_CONFIG.input.maxSensitivity * 100,
        5,
        Math.round(s.mouseSensitivity * 100),
        (v) => (v / 100).toFixed(2),
        (v) => this.update({ mouseSensitivity: v / 100 }),
      );
      this.sliderRow("Görüş Alanı (FOV)", GAME_CONFIG.camera.minFov, GAME_CONFIG.camera.maxFov, 1, s.fov, (v) => `${v}°`, (v) =>
        this.update({ fov: v }),
      );
      this.toggleRow("Y Eksenini Ters Çevir", s.invertY, (v) => this.update({ invertY: v }));
      const table = el("table", "controls-table", this.body);
      const rows: [string, string][] = [
        ["W A S D", "Hareket"],
        ["Fare", "Kamera"],
        ["Shift", "Koşma"],
        ["Space", "Zıplama / Kürek çekme (gemi)"],
        ["E", "Etkileşim · Top açısını yükselt"],
        ["Q", "Top açısını düşür"],
        ["F", "Özel etkileşim · Sancak dik · Toptan ayrıl"],
        ["Sol Tık", "Etkileşim / Ateş"],
        ["Fare Tekeri", "Top açısı"],
        ["ESC", "Menü"],
      ];
      for (const [k, v] of rows) {
        const tr = el("tr", "", table);
        el("td", "", tr, k);
        el("td", "", tr, v);
      }
    }
  }

  private update(patch: Partial<Settings>): void {
    this.save.updateSettings(patch);
  }

  private row(label: string): HTMLDivElement {
    const row = el("div", "setting-row", this.body);
    el("label", "", row, label);
    return el("div", "setting-control", row);
  }

  private sliderRow(label: string, min: number, max: number, step: number, value: number, fmt: (v: number) => string, onChange: (v: number) => void): void {
    const ctl = this.row(label);
    const input = el("input", "", ctl);
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    const val = el("span", "val", ctl, fmt(value));
    input.addEventListener("input", () => {
      const v = Number(input.value);
      val.textContent = fmt(v);
      onChange(v);
    });
    input.addEventListener("change", () => this.sfx("uiClick"));
  }

  private toggleRow(label: string, value: boolean, onChange: (v: boolean) => void): void {
    const ctl = this.row(label);
    const t = el("button", `toggle${value ? " on" : ""}`, ctl);
    t.setAttribute("aria-pressed", String(value));
    t.addEventListener("click", () => {
      const next = !t.classList.contains("on");
      t.classList.toggle("on", next);
      t.setAttribute("aria-pressed", String(next));
      this.sfx("uiClick");
      onChange(next);
    });
  }

  private segRow(label: string, options: { value: string; label: string }[], value: string, onChange: (v: string) => void): void {
    const ctl = this.row(label);
    const seg = el("div", "seg", ctl);
    const buttons: HTMLButtonElement[] = [];
    for (const o of options) {
      const b = el("button", o.value === value ? "active" : "", seg, o.label);
      buttons.push(b);
      b.addEventListener("click", () => {
        for (const other of buttons) other.classList.remove("active");
        b.classList.add("active");
        this.sfx("uiClick");
        onChange(o.value);
      });
    }
  }
}
