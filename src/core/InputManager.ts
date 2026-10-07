export type GameAction =
  | "forward"
  | "back"
  | "left"
  | "right"
  | "jump"
  | "sprint"
  | "interact"
  | "action"
  | "fire"
  | "aimUp"
  | "aimDown"
  | "pause"
  | "skip";

const KEY_BINDINGS: Record<string, GameAction[]> = {
  KeyW: ["forward"],
  ArrowUp: ["forward"],
  KeyS: ["back"],
  ArrowDown: ["back"],
  KeyA: ["left"],
  ArrowLeft: ["left"],
  KeyD: ["right"],
  ArrowRight: ["right"],
  Space: ["jump", "skip"],
  ShiftLeft: ["sprint"],
  ShiftRight: ["sprint"],
  KeyE: ["interact", "aimUp"],
  KeyF: ["action"],
  KeyQ: ["aimDown"],
  Escape: ["pause"],
  Enter: ["skip"],
};

/**
 * Unified input layer. Keyboard, mouse (pointer lock), wheel and the virtual touch
 * controls all feed the same action state so gameplay code never cares about the device.
 */
export class InputManager {
  private down = new Set<GameAction>();
  private virtualDown = new Set<GameAction>();
  private pressed = new Set<GameAction>();
  private released = new Set<GameAction>();
  private lookX = 0;
  private lookY = 0;
  private wheel = 0;
  private moveAxisX = 0;
  private moveAxisY = 0;
  private disposers: (() => void)[] = [];
  private lockListeners = new Set<(locked: boolean) => void>();

  /** When false, gameplay actions are ignored (menus/dialogues own the input). */
  gameplayEnabled = false;
  isTouch = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const onKeyDown = (e: KeyboardEvent) => {
      const actions = KEY_BINDINGS[e.code];
      if (!actions) return;
      if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
      if (e.repeat) return;
      for (const a of actions) {
        if (!this.down.has(a)) this.pressed.add(a);
        this.down.add(a);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const actions = KEY_BINDINGS[e.code];
      if (!actions) return;
      for (const a of actions) {
        this.down.delete(a);
        this.released.add(a);
      }
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!this.isPointerLocked) return;
      // Some browsers emit a huge spike right after locking — ignore it.
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.lookX += e.movementX;
      this.lookY += e.movementY;
    };
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0 && this.isPointerLocked) {
        this.pressed.add("fire");
        this.down.add("fire");
      }
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        this.down.delete("fire");
        this.released.add("fire");
      }
    };
    const onWheel = (e: WheelEvent) => {
      if (this.isPointerLocked) this.wheel += Math.sign(e.deltaY);
    };
    const onBlur = () => {
      this.down.clear();
      this.virtualDown.clear();
    };
    const onLockChange = () => {
      const locked = this.isPointerLocked;
      for (const l of this.lockListeners) l(locked);
    };
    const onTouchStart = () => {
      this.isTouch = true;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mouseup", onMouseUp);
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("blur", onBlur);
    document.addEventListener("pointerlockchange", onLockChange);
    window.addEventListener("touchstart", onTouchStart, { passive: true, once: true });

    this.disposers.push(
      () => window.removeEventListener("keydown", onKeyDown),
      () => window.removeEventListener("keyup", onKeyUp),
      () => document.removeEventListener("mousemove", onMouseMove),
      () => document.removeEventListener("mousedown", onMouseDown),
      () => document.removeEventListener("mouseup", onMouseUp),
      () => window.removeEventListener("wheel", onWheel),
      () => window.removeEventListener("blur", onBlur),
      () => document.removeEventListener("pointerlockchange", onLockChange),
      () => window.removeEventListener("touchstart", onTouchStart),
    );
  }

  get isPointerLocked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  onPointerLockChange(listener: (locked: boolean) => void): () => void {
    this.lockListeners.add(listener);
    return () => this.lockListeners.delete(listener);
  }

  requestPointerLock(): void {
    if (this.isTouch || this.isPointerLocked) return;
    try {
      const result = this.canvas.requestPointerLock() as unknown;
      if (result instanceof Promise) result.catch(() => undefined);
    } catch {
      /* pointer lock unavailable (e.g. iframe sandbox) */
    }
  }

  exitPointerLock(): void {
    if (this.isPointerLocked) document.exitPointerLock();
  }

  isDown(action: GameAction): boolean {
    return this.down.has(action) || this.virtualDown.has(action);
  }

  wasPressed(action: GameAction): boolean {
    return this.pressed.has(action);
  }

  wasReleased(action: GameAction): boolean {
    return this.released.has(action);
  }

  /** Accumulated look delta in pixels since the last call. */
  consumeLook(): { x: number; y: number } {
    const r = { x: this.lookX, y: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return r;
  }

  consumeWheel(): number {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  /** Movement vector from keys + virtual joystick, x = strafe, y = forward, length ≤ 1. */
  getMoveAxis(): { x: number; y: number } {
    let x = this.moveAxisX;
    let y = this.moveAxisY;
    if (this.isDown("forward")) y += 1;
    if (this.isDown("back")) y -= 1;
    if (this.isDown("right")) x += 1;
    if (this.isDown("left")) x -= 1;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  // ----- virtual (touch) controls -------------------------------------------------
  setVirtualAxis(x: number, y: number): void {
    this.moveAxisX = x;
    this.moveAxisY = y;
  }

  addLook(dx: number, dy: number): void {
    this.lookX += dx;
    this.lookY += dy;
  }

  setVirtualButton(action: GameAction, isDown: boolean): void {
    if (isDown) {
      if (!this.isDown(action)) this.pressed.add(action);
      this.virtualDown.add(action);
    } else {
      this.virtualDown.delete(action);
      this.released.add(action);
    }
  }

  /** Simulates a single tap of an action (used by UI buttons). */
  tap(action: GameAction): void {
    this.pressed.add(action);
  }

  /** Call once at the end of every frame. */
  endFrame(): void {
    this.pressed.clear();
    this.released.clear();
    this.wheel = 0;
  }

  resetState(): void {
    this.down.clear();
    this.virtualDown.clear();
    this.pressed.clear();
    this.released.clear();
    this.lookX = this.lookY = 0;
    this.moveAxisX = this.moveAxisY = 0;
    this.wheel = 0;
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.disposers = [];
    this.lockListeners.clear();
  }
}
