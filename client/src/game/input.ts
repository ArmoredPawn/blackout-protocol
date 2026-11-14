import { useApp } from "../store";
import type { Action } from "../prefs";

/**
 * Unified input: keyboard + mouse (Roblox-style right-drag camera / mouse-lock)
 * + touch (virtual joystick, look pad, buttons). Game code polls this each frame.
 */
type Handler = (action: Action, down: boolean) => void;

class Input {
  keys = new Set<string>();
  virtual = new Set<Action>();
  /** Joystick vector from touch controls: x = right, y = forward, length ≤ 1. */
  stick = { x: 0, y: 0 };
  look = { dx: 0, dy: 0 };
  wheel = 0;
  rmb = false;
  mouseLocked = false;
  lmbClicks = 0;
  crawlToggled = false;
  private handlers = new Set<Handler>();
  private attached = false;
  canvas: HTMLElement | null = null;

  typing() {
    const el = document.activeElement as HTMLElement | null;
    return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
  }

  private actionsFor(code: string): Action[] {
    const b = useApp.getState().prefs.bindings;
    return (Object.keys(b) as Action[]).filter((a) => b[a].includes(code));
  }

  isDown(a: Action): boolean {
    if (this.virtual.has(a)) return true;
    const codes = useApp.getState().prefs.bindings[a];
    for (const c of codes) if (this.keys.has(c)) return true;
    return false;
  }

  on(h: Handler) {
    this.handlers.add(h);
    return () => {
      this.handlers.delete(h);
    };
  }

  emit(a: Action, down: boolean) {
    if (a === "crawlToggle" && down) this.crawlToggled = !this.crawlToggled;
    for (const h of this.handlers) h(a, down);
  }

  setVirtual(a: Action, down: boolean) {
    const had = this.virtual.has(a);
    if (down) this.virtual.add(a);
    else this.virtual.delete(a);
    if (had !== down) this.emit(a, down);
  }

  consumeLook() {
    const l = { ...this.look };
    this.look.dx = this.look.dy = 0;
    return l;
  }

  consumeWheel() {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  releaseAll() {
    for (const code of this.keys) for (const a of this.actionsFor(code)) this.emit(a, false);
    this.keys.clear();
    this.virtual.clear();
    this.rmb = false;
    this.stick.x = this.stick.y = 0;
  }

  setMouseLock(on: boolean) {
    this.mouseLocked = on;
    try {
      if (on && this.canvas && document.pointerLockElement !== this.canvas) this.canvas.requestPointerLock?.();
      if (!on && document.pointerLockElement) document.exitPointerLock();
    } catch {
      /* pointer lock unsupported */
    }
  }

  attach() {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener("keydown", (e) => {
      if (this.typing()) return;
      if (e.code === "Tab" || e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      for (const a of this.actionsFor(e.code)) this.emit(a, true);
    });
    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
      for (const a of this.actionsFor(e.code)) this.emit(a, false);
    });
    window.addEventListener("blur", () => this.releaseAll());
    document.addEventListener("visibilitychange", () => document.hidden && this.releaseAll());
    document.addEventListener("pointerlockchange", () => {
      if (!document.pointerLockElement && this.mouseLocked) this.mouseLocked = false;
    });
    window.addEventListener("mousemove", (e) => {
      if (this.rmb || document.pointerLockElement) {
        this.look.dx += e.movementX;
        this.look.dy += e.movementY;
      }
    });
    window.addEventListener("mouseup", (e) => {
      if (e.button === 2) this.rmb = false;
    });
    window.addEventListener("contextmenu", (e) => {
      if ((e.target as HTMLElement)?.tagName === "CANVAS") e.preventDefault();
    });
  }

  /** Bind mouse handlers that only apply over the game canvas. */
  bindCanvas(el: HTMLElement) {
    this.canvas = el;
    const down = (e: MouseEvent) => {
      if (e.button === 2) {
        this.rmb = true;
        e.preventDefault();
      }
      if (e.button === 0) this.lmbClicks++;
    };
    const wheel = (e: WheelEvent) => {
      this.wheel += Math.sign(e.deltaY);
    };
    el.addEventListener("mousedown", down);
    el.addEventListener("wheel", wheel, { passive: true });
    return () => {
      el.removeEventListener("mousedown", down);
      el.removeEventListener("wheel", wheel);
      if (this.canvas === el) this.canvas = null;
    };
  }
}

export const input = new Input();
