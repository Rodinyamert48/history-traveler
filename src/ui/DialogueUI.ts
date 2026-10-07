import { el, setText } from "./dom";

export interface DialogueLine {
  speaker: string;
  role?: string;
  text: string;
}

/** Bottom dialogue box with a typewriter reveal. `advance()` skips / continues. */
export class DialogueUI {
  readonly root: HTMLDivElement;
  private speaker: HTMLSpanElement;
  private role: HTMLSpanElement;
  private text: HTMLDivElement;
  private lines: DialogueLine[] = [];
  private index = 0;
  private shown = 0;
  private full = "";
  private resolve: (() => void) | null = null;
  private onLine: ((line: DialogueLine) => void) | null = null;
  private charRate = 48;
  private accum = 0;

  constructor(parent: HTMLElement) {
    this.root = el("div", "dialogue hidden", parent);
    const head = el("div", "", this.root);
    this.speaker = el("span", "dialogue-speaker", head);
    this.role = el("span", "dialogue-role", head);
    this.text = el("div", "dialogue-text", this.root);
    el("div", "dialogue-continue", this.root, "Devam · E / Space / Tıkla");
    this.root.addEventListener("click", () => this.advance());
  }

  get isOpen(): boolean {
    return !this.root.classList.contains("hidden");
  }

  /** Plays lines in sequence; resolves when the last one is dismissed. */
  play(lines: DialogueLine[], onLine?: (line: DialogueLine) => void): Promise<void> {
    this.lines = lines;
    this.index = 0;
    this.onLine = onLine ?? null;
    this.root.classList.remove("hidden");
    this.showLine();
    return new Promise((resolve) => (this.resolve = resolve));
  }

  private showLine(): void {
    const line = this.lines[this.index];
    setText(this.speaker, line.speaker);
    setText(this.role, line.role ?? "");
    this.full = line.text;
    this.shown = 0;
    this.accum = 0;
    this.text.textContent = "";
    this.onLine?.(line);
  }

  update(dt: number): void {
    if (!this.isOpen || this.shown >= this.full.length) return;
    this.accum += dt * this.charRate;
    const n = Math.min(this.full.length, Math.floor(this.accum));
    if (n !== this.shown) {
      this.shown = n;
      this.text.textContent = this.full.slice(0, n);
    }
  }

  advance(): void {
    if (!this.isOpen) return;
    if (this.shown < this.full.length) {
      this.shown = this.full.length;
      this.text.textContent = this.full;
      return;
    }
    this.index++;
    if (this.index >= this.lines.length) {
      this.close();
      return;
    }
    this.showLine();
  }

  close(): void {
    this.root.classList.add("hidden");
    const r = this.resolve;
    this.resolve = null;
    r?.();
  }
}
