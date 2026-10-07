import { el } from "./dom";

export interface ModalButton {
  label: string;
  primary?: boolean;
  onClick(): void;
}

/** Generic modal used for the pause menu, "Hakkında", failure/retry and the ending screen. */
export class Modal {
  readonly root: HTMLDivElement;
  private card: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.root = el("div", "modal hidden", parent);
    this.card = el("div", "modal-card", this.root);
  }

  get isOpen(): boolean {
    return !this.root.classList.contains("hidden");
  }

  show(title: string, bodyHtml: string, buttons: ModalButton[], extraClass = ""): void {
    this.card.className = `modal-card ${extraClass}`;
    this.card.innerHTML = "";
    if (title) el("h2", "", this.card, title);
    if (title) el("div", "ornament-line", this.card);
    if (bodyHtml) el("div", "", this.card, bodyHtml);
    const wrap = el("div", "modal-buttons", this.card);
    for (const b of buttons) {
      const btn = el("button", b.primary ? "btn" : "btn secondary", wrap, b.label);
      btn.addEventListener("click", () => b.onClick());
    }
    this.root.classList.remove("hidden");
  }

  hide(): void {
    this.root.classList.add("hidden");
  }
}
