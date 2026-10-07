import { EMBLEM_SVG, el, setText } from "./dom";

const TIPS = [
  "1453 baharında Osmanlı donanması, Haliç'i kapatan zinciri aşmak için gemileri karadan yürüttü.",
  "Kara surları, Theodosius döneminde inşa edilmiş çift sıra surlar ve hendekten oluşuyordu.",
  "Şahi topları dönemin en büyük toplarıydı; atışlar arasında saatler geçebiliyordu.",
  "Shift ile koşabilir, E ile etkileşime girebilirsin. ESC menüyü açar.",
  "Grafik ayarlarını oyun içinden değiştirebilirsin; mobilde kalite otomatik düşürülür.",
];

export class LoadingScreen {
  readonly root: HTMLDivElement;
  private fill: HTMLDivElement;
  private status: HTMLDivElement;
  private title: HTMLDivElement;
  private sub: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.root = el("div", "loading-screen", parent);
    el("div", "emblem", this.root, EMBLEM_SVG);
    this.title = el("div", "loading-title", this.root, "TARİHİN İÇİNE GİR");
    this.sub = el("div", "loading-sub", this.root, "Tarih Yolcusu");
    const bar = el("div", "loading-bar", this.root);
    this.fill = el("div", "loading-bar-fill", bar);
    this.status = el("div", "loading-status", this.root);
    el("div", "loading-tip", this.root, TIPS[Math.floor(Math.random() * TIPS.length)]);
  }

  setTitle(title: string, sub: string): void {
    setText(this.title, title);
    setText(this.sub, sub);
  }

  setProgress(fraction: number, status: string): void {
    this.fill.style.width = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
    setText(this.status, status);
  }

  show(): void {
    this.root.classList.remove("hidden");
    this.root.style.opacity = "1";
  }

  async hide(): Promise<void> {
    this.root.style.transition = "opacity 0.7s ease";
    this.root.style.opacity = "0";
    await new Promise((r) => setTimeout(r, 720));
    this.root.classList.add("hidden");
  }
}
