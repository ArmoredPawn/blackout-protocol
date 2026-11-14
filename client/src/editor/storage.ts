import { validateMap, type MapDefinition } from "@bp/shared";

/**
 * Custom maps are saved in this browser's localStorage only. Share them with
 * friends as a file or a "BPM1." share code.
 */
const KEY = "bp.maps.v1";
export const MAX_SAVED_MAPS = 30;

export interface SavedMap {
  /** Local id (independent of map.id, which the server rewrites to "custom"). */
  key: string;
  updatedAt: number;
  map: MapDefinition;
}

export function loadSavedMaps(): SavedMap[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    const out: SavedMap[] = [];
    for (const e of arr) {
      if (!e || typeof e.key !== "string") continue;
      // Saved drafts may be incomplete, so keep anything structurally readable.
      if (e.map && typeof e.map === "object" && Array.isArray(e.map.floors)) out.push({ key: e.key, updatedAt: Number(e.updatedAt) || 0, map: e.map });
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function write(list: SavedMap[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false; // quota exceeded or storage unavailable
  }
}

export function saveMap(key: string, map: MapDefinition): boolean {
  const list = loadSavedMaps().filter((m) => m.key !== key);
  list.unshift({ key, updatedAt: Date.now(), map });
  return write(list.slice(0, MAX_SAVED_MAPS));
}

export function deleteSavedMap(key: string) {
  write(loadSavedMaps().filter((m) => m.key !== key));
}

/** Maps that pass full validation and can be used in a room. */
export function playableSavedMaps(): SavedMap[] {
  return loadSavedMaps().filter((m) => validateMap(m.map).ok);
}

export function newKey() {
  return `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function downloadJson(map: MapDefinition) {
  const blob = new Blob([JSON.stringify(map)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${(map.name || "map").replace(/[^a-z0-9-_ ]/gi, "").trim().replace(/\s+/g, "-").toLowerCase() || "map"}.bpmap.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
