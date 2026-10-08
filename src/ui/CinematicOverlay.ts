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
  private quote: HTMLDivElement;
  private photo: HTMLDivElement;

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
    this.quote = el("div", "cine-quote hidden", parent);
    this.photo = el("div", "photo-frame", parent);
  }

  /**
   * Turns the live 3D view into an old photograph: sepia/contrast on the canvas and a paper
   * frame with a caption fading in over `seconds`.
   */
  showPhoto(canvas: HTMLCanvasElement, caption: string, seconds: number): void {
    canvas.style.transition = `filter ${seconds}s ease`;
    canvas.style.filter = "sepia(0.9) contrast(1.18) brightness(0.92) saturate(0.85)";
    this.photo.innerHTML = `<div class="pf-grain"></div><div class="pf-caption">${caption}</div>`;
    this.photo.style.transition = `opacity ${seconds}s ease`;
    void this.photo.offsetWidth;
    this.photo.classList.add("show");
  }

  hidePhoto(canvas: HTMLCanvasElement): void {
    canvas.style.transition = "";
    canvas.style.filter = "";
    this.photo.classList.remove("show");
  }

  /**
   * Large centred quotation (spoken line or closing words). `dark` puts it on the black
   * fade; `actions` adds buttons below once the quote has settled.
   */
  showQuote(text: string, attribution: string, opts: { dark?: boolean; actions?: { label: string; primary?: boolean; onClick: () => void }[]; actionsDelay?: number } = {}): void {
    const q = this.quote;
    q.innerHTML = "";
    q.className = `cine-quote${opts.dark ? " dark" : ""}`;
    el("div", "cq-text", q, text);
    el("div", "cq-attr", q, attribution);
    if (opts.actions?.length) {
      const row = el("div", "cq-actions", q);
      for (const a of opts.actions) {
        const b = el("button", `btn${a.primary ? "" : " secondary"}`, row, a.label);
        b.addEventListener("click", a.onClick);
      }
      window.setTimeout(() => row.classList.add("show"), opts.actionsDelay ?? 4000);
    }
    void q.offsetWidth;
    q.classList.add("show");
  }

  async hideQuote(seconds = 1): Promise<void> {
    this.quote.classList.remove("show");
    await wait(seconds * 1000);
    this.quote.classList.add("hidden");
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
