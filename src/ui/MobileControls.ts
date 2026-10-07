import { GAME_CONFIG } from "../config/gameConfig";
import type { GameAction, InputManager } from "../core/InputManager";
import { el } from "./dom";

export type TouchLayout = "explore" | "ship" | "cannon" | "hidden";

/**
 * Touch controls: virtual joystick (left), drag-to-look area (right), action buttons.
 * Layouts switch per context — e.g. the ship minigame shows one big "ÇEK" button and the
 * cannon minigame uses drag-to-aim + elevation/fire buttons.
 */
export class MobileControls {
  readonly root: HTMLDivElement;
  private joystick: HTMLDivElement;
  private knob: HTMLDivElement;
  private look: HTMLDivElement;
  private buttons: HTMLDivElement;
  private center: HTMLDivElement;
  private aim: HTMLDivElement;
  private pause: HTMLButtonElement;
  private joyPointer: number | null = null;
  private lookPointer: number | null = null;
  private lastLook = { x: 0, y: 0 };
  private layout: TouchLayout = "hidden";
  private interactBtn: HTMLButtonElement;
  private actionBtn: HTMLButtonElement;

  constructor(
    parent: HTMLElement,
    private readonly input: InputManager,
    onPause: () => void,
  ) {
    this.root = el("div", "mobile-controls hidden", parent);
    this.look = el("div", "touch-look", this.root);
    this.joystick = el("div", "joystick", this.root);
    this.knob = el("div", "joystick-knob", this.joystick);
    this.buttons = el("div", "touch-buttons", this.root);
    this.interactBtn = this.button(this.buttons, "E", "interact");
    this.actionBtn = this.button(this.buttons, "F", "action");
    this.button(this.buttons, "KOŞ", "sprint", true);
    this.button(this.buttons, "ZIPLA", "jump");
    this.center = el("div", "touch-center hidden", this.root);
    this.button(this.center, "ÇEK", "jump", false, "big");
    this.aim = el("div", "touch-aim-slider hidden", this.root);
    this.button(this.aim, "▲", "aimUp", true);
    this.button(this.aim, "▼", "aimDown", true);
    this.button(this.aim, "ATEŞ", "fire");
    this.button(this.aim, "ÇIK", "action");
    this.pause = el("button", "touch-btn touch-pause", this.root, "❚❚");
    this.pause.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      onPause();
    });

    this.joystick.addEventListener("pointerdown", (e) => {
      this.joyPointer = e.pointerId;
      this.joystick.setPointerCapture(e.pointerId);
      this.updateJoystick(e);
    });
    this.joystick.addEventListener("pointermove", (e) => {
      if (e.pointerId === this.joyPointer) this.updateJoystick(e);
    });
    const endJoy = (e: PointerEvent) => {
      if (e.pointerId !== this.joyPointer) return;
      this.joyPointer = null;
      this.knob.style.transform = "";
      this.input.setVirtualAxis(0, 0);
    };
    this.joystick.addEventListener("pointerup", endJoy);
    this.joystick.addEventListener("pointercancel", endJoy);

    this.look.addEventListener("pointerdown", (e) => {
      this.lookPointer = e.pointerId;
      this.look.setPointerCapture(e.pointerId);
      this.lastLook = { x: e.clientX, y: e.clientY };
    });
    this.look.addEventListener("pointermove", (e) => {
      if (e.pointerId !== this.lookPointer) return;
      const k = GAME_CONFIG.input.touchLookScale / GAME_CONFIG.input.baseMouseScale;
      this.input.addLook((e.clientX - this.lastLook.x) * k, (e.clientY - this.lastLook.y) * k);
      this.lastLook = { x: e.clientX, y: e.clientY };
    });
    const endLook = (e: PointerEvent) => {
      if (e.pointerId === this.lookPointer) this.lookPointer = null;
    };
    this.look.addEventListener("pointerup", endLook);
    this.look.addEventListener("pointercancel", endLook);
  }

  private button(parent: HTMLElement, label: string, action: GameAction, hold = false, extra = ""): HTMLButtonElement {
    const b = el("button", `touch-btn ${extra}`, parent, label);
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      b.setPointerCapture(e.pointerId);
      b.classList.add("active");
      this.input.setVirtualButton(action, true);
    });
    const up = (e: PointerEvent) => {
      e.preventDefault();
      b.classList.remove("active");
      this.input.setVirtualButton(action, false);
    };
    b.addEventListener("pointerup", up);
    b.addEventListener("pointercancel", up);
    void hold;
    return b;
  }

  private updateJoystick(e: PointerEvent): void {
    const rect = this.joystick.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const r = GAME_CONFIG.input.joystickRadiusPx;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const len = Math.hypot(dx, dy);
    if (len > r) {
      dx = (dx / len) * r;
      dy = (dy / len) * r;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    this.input.setVirtualAxis(dx / r, -dy / r);
  }

  setLayout(layout: TouchLayout): void {
    this.layout = layout;
    const touch = this.input.isTouch;
    this.root.classList.toggle("hidden", !touch || layout === "hidden");
    const explore = layout === "explore";
    this.joystick.classList.toggle("hidden", !explore);
    this.buttons.classList.toggle("hidden", !explore);
    this.center.classList.toggle("hidden", layout !== "ship");
    this.aim.classList.toggle("hidden", layout !== "cannon");
    this.look.classList.toggle("hidden", !(explore || layout === "cannon"));
    if (!explore) this.input.setVirtualAxis(0, 0);
  }

  get currentLayout(): TouchLayout {
    return this.layout;
  }

  /** Re-evaluates visibility once the first touch reveals a touch device. */
  refresh(): void {
    this.setLayout(this.layout);
  }

  setInteractLabels(interact: string, action: string): void {
    this.interactBtn.textContent = interact;
    this.actionBtn.textContent = action;
  }
}
