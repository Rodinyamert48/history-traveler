import { el } from "./dom";

export interface MainMenuActions {
  onPlay(): void;
  onSettings(): void;
  onAbout(): void;
}

export class MainMenu {
  readonly root: HTMLDivElement;
  private playBtn: HTMLButtonElement;

  constructor(parent: HTMLElement, actions: MainMenuActions, hover: () => void) {
    this.root = el("div", "main-menu hidden", parent);
    el("div", "game-title", this.root, "TARİH YOLCUSU");
    el("div", "game-subtitle", this.root, "Türkiye'nin tarihini bizzat yaşa");
    el("div", "ornament-line", this.root).style.width = "min(420px, 70vw)";
    const buttons = el("div", "menu-buttons", this.root);
    this.playBtn = el("button", "btn", buttons, "Haritaya Git");
    const settings = el("button", "btn secondary", buttons, "Ayarlar");
    const about = el("button", "btn secondary", buttons, "Hakkında");
    this.playBtn.addEventListener("click", actions.onPlay);
    settings.addEventListener("click", actions.onSettings);
    about.addEventListener("click", actions.onAbout);
    for (const b of [this.playBtn, settings, about]) b.addEventListener("mouseenter", hover);
    el(
      "div",
      "menu-footer",
      this.root,
      "Babylon.js · WebGPU / WebGL · Tüm modeller, dokular, müzik ve ses efektleri prosedürel olarak üretilir.",
    );
  }

  setPlayLabel(label: string): void {
    this.playBtn.textContent = label;
  }

  show(): void {
    this.root.classList.remove("hidden");
    this.root.style.opacity = "0";
    requestAnimationFrame(() => (this.root.style.opacity = "1"));
  }

  async hide(): Promise<void> {
    this.root.style.opacity = "0";
    await new Promise((r) => setTimeout(r, 650));
    this.root.classList.add("hidden");
  }
}
