import { create } from "zustand";
import { DEFAULT_SETTINGS, sanitizeSettings, type RoomSettings, type SkillCheckMsg } from "@bp/shared";
import { loadPrefs, savePrefs, type Prefs } from "./prefs";
import type { RoomSnap } from "./net/types";

export type Screen = "home" | "avatar" | "editor" | "room";
export type ConnStatus = "idle" | "connecting" | "connected" | "reconnecting" | "error";

export interface Toast {
  id: number;
  text: string;
  tone: "info" | "good" | "bad" | "warn";
}

export interface ChatLine {
  id: number;
  name: string;
  text: string;
  self: boolean;
}

interface AppState {
  screen: Screen;
  prefs: Prefs;
  conn: ConnStatus;
  error: string;
  myId: string;
  snap: RoomSnap | null;
  settings: RoomSettings;
  toasts: Toast[];
  chat: ChatLine[];
  skillCheck: (SkillCheckMsg & { receivedAt: number }) | null;
  /** Join code from an invite link, pre-filled on the home screen. */
  inviteCode: string;
  showPrefs: boolean;
  showMap: boolean;
  setScreen(s: Screen): void;
  updatePrefs(p: Partial<Prefs>): void;
  toast(text: string, tone?: Toast["tone"]): void;
  dismissToast(id: number): void;
}

let toastId = 1;

export const useApp = create<AppState>((set, get) => ({
  screen: "home",
  prefs: loadPrefs(),
  conn: "idle",
  error: "",
  myId: "",
  snap: null,
  settings: DEFAULT_SETTINGS,
  toasts: [],
  chat: [],
  skillCheck: null,
  inviteCode: "",
  showPrefs: false,
  showMap: false,
  setScreen: (screen) => set({ screen }),
  updatePrefs: (p) => {
    const prefs = { ...get().prefs, ...p };
    savePrefs(prefs);
    set({ prefs });
  },
  toast: (text, tone = "info") => {
    const id = toastId++;
    set((s) => ({ toasts: [...s.toasts.slice(-4), { id, text, tone }] }));
    setTimeout(() => get().dismissToast(id), 4200);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Parse server settings JSON safely (it's already validated server-side). */
export function parseSettings(json: string | undefined): RoomSettings {
  try {
    return sanitizeSettings(JSON.parse(json ?? "{}"), DEFAULT_SETTINGS);
  } catch {
    return DEFAULT_SETTINGS;
  }
}
