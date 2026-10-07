import { el } from "./dom";
import { wait } from "../utils/async";

/** Title cards ("İSTANBUL" / "1453"), haze/fade overlay, letterbox bars and skip hint. */
export class CinematicOverlay {
  private card: HTMLDivElement;
  private city: HTMLDivElement;
  private year: HTMLDivElement;
  private sub: HTMLDivElement;
  private overlay: HTMLDivElement;
  private boxTop: HTMLDivElement;
  private boxBottom: HTMLDivElement;
  private skip: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.boxTop = el("div", "letterbox top", parent);
    this.boxBottom = el("div", "letterbox bottom", parent);
    this.overlay = el("div", "transition-overlay", parent);
    for (let i = 0; i < 4; i++) {
      const c = el("div", "cloud", this.overlay);
      c.style.left = `${-20 + i * 25}%`;
      c.style.top = `${10 + ((i * 37) % 60)}%`;
      c.style.animationDelay = `${-i * 1.3}s`;
    }
    this.card = el("div", "title-card hidden", parent);
    this.city = el("div", "tc-city", this.card);
    this.year = el("div", "tc-year", this.card);
    this.sub = el("div", "tc-sub", this.card);
    this.skip = el("div", "skip-hint hidden", parent, "Atla · Space");
  }

  setLetterbox(on: boolean): void {
    this.boxTop.classList.toggle("on", on);
    this.boxBottom.classList.toggle("on", on);
  }

  setSkipHint(visible: boolean, text?: string): void {
    if (text) this.skip.textContent = text;
    this.skip.classList.toggle("hidden", !visible);
  }

  /** Fades the haze (light) or black (dark) overlay. */
  async fade(to: number, seconds: number, dark = false): Promise<void> {
    this.overlay.classList.toggle("dark", dark);
    this.overlay.style.transition = `opacity ${seconds}s ease`;
    this.overlay.style.opacity = String(to);
    await wait(seconds * 1000);
  }

  setFadeInstant(to: number, dark = false): void {
    this.overlay.classList.toggle("dark", dark);
    this.overlay.style.transition = "none";
    this.overlay.style.opacity = String(to);
  }

  showTitleCity(city: string, year: string, subtitle: string): void {
    this.city.textContent = city;
    this.year.textContent = year;
    this.sub.textContent = subtitle;
    this.card.classList.remove("hidden", "out", "show-year", "show-city");
    void this.card.offsetWidth;
    this.card.classList.add("show-city");
  }

  showTitleYear(): void {
    this.card.classList.add("show-year");
  }

  async hideTitle(): Promise<void> {
    this.card.classList.add("out");
    await wait(900);
    this.card.classList.add("hidden");
    this.card.classList.remove("out", "show-year", "show-city");
  }
}
