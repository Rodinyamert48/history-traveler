import type { CityEntry } from "../data/types";
import { el, escapeHtml, setText } from "./dom";

export interface CityTooltip {
  name: string;
  message: string;
  teaser?: string;
  active: boolean;
}

interface CityLabel {
  root: HTMLDivElement;
  name: HTMLDivElement;
  era: HTMLDivElement;
}

/** DOM overlay for the Türkiye map: header, playable-city labels, hover tooltip, legend. */
export class MapUI {
  readonly root: HTMLDivElement;
  private labels = new Map<string, CityLabel>();
  private tooltip: HTMLDivElement;
  private backBtn: HTMLButtonElement;
  private settingsBtn: HTMLButtonElement;
  private info: HTMLDivElement;
  private infoCity: string | null = null;

  constructor(parent: HTMLElement, onBack: () => void, onSettings: () => void) {
    this.root = el("div", "map-ui hidden", parent);
    const header = el("div", "map-header", this.root);
    el("h2", "", header, "TÜRKİYE");
    el("p", "", header, "Bir şehir seç ve tarihin içine gir");
    this.tooltip = el("div", "map-tooltip hidden", this.root);
    const corner = el("div", "map-corner", this.root);
    this.backBtn = el("button", "btn secondary", corner, "Ana Menü");
    this.settingsBtn = el("button", "btn secondary", corner, "Ayarlar");
    this.backBtn.addEventListener("click", onBack);
    this.settingsBtn.addEventListener("click", onSettings);
    this.info = el("div", "city-info", this.root);
    const legend = el("div", "map-legend", this.root);
    legend.innerHTML = `
      <div><span class="legend-dot" style="background:#c8202a"></span>Oynanabilir şehir</div>
      <div><span class="legend-dot" style="background:#8a8378"></span>Henüz keşfedilmedi</div>`;
  }

  show(): void {
    this.root.classList.remove("hidden");
  }

  get infoOpen(): boolean {
    return this.infoCity !== null;
  }

  /**
   * Side panel about a city's historical event. Playable cities get an "Oyna" button that
   * starts the chapter; the others show what is coming.
   */
  showCityInfo(city: CityEntry, completed: boolean, onPlay: () => void, onClose: () => void): void {
    this.infoCity = city.id;
    const box = this.info;
    box.innerHTML = "";
    const close = el("button", "ci-close", box, "×");
    close.setAttribute("aria-label", "Kapat");
    close.addEventListener("click", onClose);
    el("div", "ci-city", box, escapeHtml(city.name.toLocaleUpperCase("tr-TR")));
    el("div", "ci-year", box, String(city.year));
    el("div", "ci-title", box, escapeHtml(city.title));
    if (city.date) el("div", "ci-date", box, escapeHtml(city.date));
    if (city.summary) el("p", "ci-summary", box, escapeHtml(city.summary));
    if (city.active && city.chapter?.length) {
      el("div", "ci-head", box, "Bu bölümde");
      const ul = el("ul", "ci-list", box);
      for (const line of city.chapter) el("li", "", ul, escapeHtml(line));
    }
    const row = el("div", "ci-actions", box);
    if (city.active && city.scenario) {
      if (completed) el("div", "ci-done", row, `✓ ${escapeHtml(city.doneLabel ?? "TAMAMLANDI")}`);
      const play = el("button", "btn", row, completed ? "Tekrar Oyna" : "Oyna");
      play.addEventListener("click", onPlay);
    } else {
      el("div", "ci-soon", row, "Bu bölüm yakında oynanabilir olacak.");
    }
    box.classList.remove("show");
    void box.offsetWidth;
    box.classList.add("show");
  }

  hideCityInfo(): void {
    this.infoCity = null;
    this.info.classList.remove("show");
  }

  hide(): void {
    this.root.classList.add("hidden");
    this.hideCityInfo();
  }

  setControlsVisible(visible: boolean): void {
    this.backBtn.parentElement!.style.display = visible ? "" : "none";
  }

  /** Creates/updates the floating label of a playable city. */
  setActiveCity(id: string, name: string, era: string, completed: boolean, doneText = "TAMAMLANDI"): void {
    let label = this.labels.get(id);
    if (!label) {
      const root = el("div", "city-label", this.root);
      label = { root, name: el("div", "name", root), era: el("div", "era", root) };
      el("div", "stem", root);
      this.labels.set(id, label);
    }
    setText(label.name, name.toLocaleUpperCase("tr-TR"));
    setText(label.era, era);
    label.era.dataset.done = ` · ${doneText} ✓`;
    label.root.classList.toggle("completed", completed);
  }

  /** Positions a city label (screen px); hidden when off-screen. */
  placeLabel(id: string, x: number, y: number, visible: boolean, hover: boolean): void {
    const label = this.labels.get(id);
    if (!label) return;
    label.root.style.left = `${x}px`;
    label.root.style.top = `${y}px`;
    label.root.style.opacity = visible ? "1" : "0";
    label.root.classList.toggle("hover", hover);
  }

  hideLabels(): void {
    for (const l of this.labels.values()) l.root.style.opacity = "0";
  }

  showTooltip(t: CityTooltip | null, x: number, y: number): void {
    if (!t) {
      this.tooltip.classList.add("hidden");
      return;
    }
    const html = `<div class="tt-name">${escapeHtml(t.name.toLocaleUpperCase("tr-TR"))}</div>
      <div class="tt-msg">${escapeHtml(t.message)}</div>${t.teaser ? `<div class="tt-soon">${escapeHtml(t.teaser)}</div>` : ""}`;
    if (this.tooltip.innerHTML !== html) this.tooltip.innerHTML = html;
    this.tooltip.classList.toggle("active", t.active);
    this.tooltip.classList.remove("hidden");
    const w = this.tooltip.offsetWidth;
    const h = this.tooltip.offsetHeight;
    const px = Math.min(x, window.innerWidth - w - 30);
    const py = Math.min(y, window.innerHeight - h - 30);
    this.tooltip.style.left = `${px}px`;
    this.tooltip.style.top = `${py}px`;
  }
}
