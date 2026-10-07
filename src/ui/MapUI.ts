import { el, escapeHtml, setText } from "./dom";

export interface CityTooltip {
  name: string;
  message: string;
  teaser?: string;
  active: boolean;
}

/** DOM overlay for the Türkiye map: header, İstanbul label, hover tooltip, legend. */
export class MapUI {
  readonly root: HTMLDivElement;
  private label: HTMLDivElement;
  private labelName: HTMLDivElement;
  private labelEra: HTMLDivElement;
  private tooltip: HTMLDivElement;
  private backBtn: HTMLButtonElement;
  private settingsBtn: HTMLButtonElement;

  constructor(parent: HTMLElement, onBack: () => void, onSettings: () => void) {
    this.root = el("div", "map-ui hidden", parent);
    const header = el("div", "map-header", this.root);
    el("h2", "", header, "TÜRKİYE");
    el("p", "", header, "Bir şehir seç ve tarihin içine gir");
    this.label = el("div", "city-label", this.root);
    this.labelName = el("div", "name", this.label, "İSTANBUL");
    this.labelEra = el("div", "era", this.label, "1453 — İstanbul'un Fethi");
    el("div", "stem", this.label);
    this.tooltip = el("div", "map-tooltip hidden", this.root);
    const corner = el("div", "map-corner", this.root);
    this.backBtn = el("button", "btn secondary", corner, "Ana Menü");
    this.settingsBtn = el("button", "btn secondary", corner, "Ayarlar");
    this.backBtn.addEventListener("click", onBack);
    this.settingsBtn.addEventListener("click", onSettings);
    const legend = el("div", "map-legend", this.root);
    legend.innerHTML = `
      <div><span class="legend-dot" style="background:#c8202a"></span>Oynanabilir şehir</div>
      <div><span class="legend-dot" style="background:#8a8378"></span>Henüz keşfedilmedi</div>`;
  }

  show(): void {
    this.root.classList.remove("hidden");
  }

  hide(): void {
    this.root.classList.add("hidden");
  }

  setControlsVisible(visible: boolean): void {
    this.backBtn.parentElement!.style.display = visible ? "" : "none";
  }

  setActiveCity(name: string, era: string, completed: boolean): void {
    setText(this.labelName, name.toLocaleUpperCase("tr-TR"));
    setText(this.labelEra, era);
    this.label.classList.toggle("completed", completed);
  }

  /** Positions the active city label (screen px); hidden when off-screen. */
  placeLabel(x: number, y: number, visible: boolean, hover: boolean): void {
    this.label.style.left = `${x}px`;
    this.label.style.top = `${y}px`;
    this.label.style.opacity = visible ? "1" : "0";
    this.label.classList.toggle("hover", hover);
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
