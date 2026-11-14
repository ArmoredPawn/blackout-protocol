import { DEFAULT_AVATAR, parseAvatar, randomToken, type Avatar } from "@bp/shared";

/**
 * Local-only preferences. Everything here lives in THIS browser's localStorage:
 * it does not sync to other devices and is lost if site data is cleared.
 */
export type Action =
  | "forward"
  | "back"
  | "left"
  | "right"
  | "jump"
  | "interact"
  | "crawl"
  | "crawlToggle"
  | "ability"
  | "slot1"
  | "slot2"
  | "slot3"
  | "mouseLock"
  | "map"
  | "scoreboard"
  | "chat";

export const ACTION_LABELS: Record<Action, string> = {
  forward: "Move forward",
  back: "Move back",
  left: "Move left",
  right: "Move right",
  jump: "Jump / struggle / skill check",
  interact: "Interact (hold)",
  crawl: "Crawl (hold)",
  crawlToggle: "Crawl (toggle)",
  ability: "Ability / powerup",
  slot1: "Powerup slot 1",
  slot2: "Powerup slot 2",
  slot3: "Powerup slot 3",
  mouseLock: "Mouse lock (toggle)",
  map: "Map",
  scoreboard: "Scoreboard (hold)",
  chat: "Chat",
};

export const DEFAULT_BINDINGS: Record<Action, string[]> = {
  forward: ["KeyW", "ArrowUp"],
  back: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  jump: ["Space"],
  interact: ["KeyE"],
  crawl: ["ShiftLeft", "ShiftRight"],
  crawlToggle: ["KeyC"],
  ability: ["KeyQ"],
  slot1: ["Digit1"],
  slot2: ["Digit2"],
  slot3: ["Digit3"],
  mouseLock: ["ControlLeft"],
  map: ["KeyM"],
  scoreboard: ["Tab"],
  chat: ["Enter", "Slash"],
};

export type Quality = "low" | "medium" | "high";

export interface Prefs {
  name: string;
  avatar: Avatar;
  token: string;
  bindings: Record<Action, string[]>;
  quality: Quality;
  sensitivity: number; // 0.2 – 3
  invertY: boolean;
  fov: number;
  master: number; // 0..1
  sfx: number;
  ambience: number;
  muted: boolean;
  touchControls: "auto" | "on" | "off";
  showFps: boolean;
}

const KEY = "bp.prefs.v1";

function defaults(): Prefs {
  return {
    name: "",
    avatar: DEFAULT_AVATAR,
    token: randomToken(24),
    bindings: { ...DEFAULT_BINDINGS },
    quality: guessQuality(),
    sensitivity: 1,
    invertY: false,
    fov: 70,
    master: 0.8,
    sfx: 0.9,
    ambience: 0.6,
    muted: false,
    touchControls: "auto",
    showFps: false,
  };
}

function guessQuality(): Quality {
  try {
    const mobile = matchMedia("(pointer: coarse)").matches;
    const cores = navigator.hardwareConcurrency ?? 4;
    if (mobile || cores <= 4) return "low";
    return cores >= 8 ? "high" : "medium";
  } catch {
    return "medium";
  }
}

export function loadPrefs(): Prefs {
  const d = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const p = JSON.parse(raw);
    const avatar = parseAvatar(p.avatar) ?? d.avatar;
    const bindings = { ...d.bindings };
    if (p.bindings && typeof p.bindings === "object") {
      for (const k of Object.keys(bindings) as Action[]) {
        const v = p.bindings[k];
        if (Array.isArray(v) && v.every((s) => typeof s === "string")) bindings[k] = v.slice(0, 3);
      }
    }
    const num = (v: unknown, lo: number, hi: number, def: number) =>
      typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def;
    return {
      ...d,
      name: typeof p.name === "string" ? p.name.slice(0, 18) : "",
      avatar,
      token: typeof p.token === "string" && /^[a-z0-9]{8,64}$/.test(p.token) ? p.token : d.token,
      bindings,
      quality: ["low", "medium", "high"].includes(p.quality) ? p.quality : d.quality,
      sensitivity: num(p.sensitivity, 0.2, 3, 1),
      invertY: !!p.invertY,
      fov: num(p.fov, 55, 95, 70),
      master: num(p.master, 0, 1, 0.8),
      sfx: num(p.sfx, 0, 1, 0.9),
      ambience: num(p.ambience, 0, 1, 0.6),
      muted: !!p.muted,
      touchControls: ["auto", "on", "off"].includes(p.touchControls) ? p.touchControls : "auto",
      showFps: !!p.showFps,
    };
  } catch {
    return d;
  }
}

export function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable (private mode) – preferences last for this session only */
  }
}

export function keyLabel(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  const map: Record<string, string> = {
    Space: "Space",
    ShiftLeft: "L-Shift",
    ShiftRight: "R-Shift",
    ControlLeft: "L-Ctrl",
    ControlRight: "R-Ctrl",
    AltLeft: "L-Alt",
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    Enter: "Enter",
    Slash: "/",
    Tab: "Tab",
    Mouse0: "LMB",
    Mouse2: "RMB",
  };
  return map[code] ?? code;
}
