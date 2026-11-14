import { DIRS, type MapDefinition, type MapEntity, type MapLighting, type ThemeId } from "../types.js";

/**
 * Authoring helper for built-in maps: draw each floor as ASCII art.
 *
 * Tiles: see types.ts. Entity glyphs (the tile under them becomes floor):
 *   T terminal   P stasis pod   E exit door (on a border wall)   S survivor spawn
 *   H hunter spawn   * powerup spawn   L ceiling light
 *   ^ > v <  stairs start cell, rising in that direction for 3 cells
 *   lowercase letters → props via PROP_LEGEND (auto-rotated to back onto a wall)
 */
export const PROP_LEGEND: Record<string, string> = {
  a: "planter",
  b: "barrel",
  c: "chair",
  d: "desk",
  e: "counter",
  f: "cabinet",
  g: "pipes",
  i: "trash",
  j: "pillar",
  k: "crate",
  l: "labtable",
  m: "machine",
  n: "vending",
  o: "console",
  p: "plant",
  q: "locker",
  r: "server",
  s: "shelf",
  t: "table",
  u: "sofa",
  w: "whiteboard",
  x: "specimen",
  y: "bookshelf",
  z: "tank",
};

const STAIR_GLYPH: Record<string, number> = { "^": 0, ">": 1, v: 2, "<": 3 };
const SOLIDISH = "#GW123";

export interface AsciiMapSpec {
  id: string;
  name: string;
  description: string;
  theme: ThemeId;
  lighting: MapLighting;
  floors: string[]; // one multi-line string per floor
  legend?: Record<string, string>;
  /** Extra colour per light (cycled). */
  lightColors?: string[];
}

export function buildAsciiMap(spec: AsciiMapSpec): MapDefinition {
  const legend = { ...PROP_LEGEND, ...spec.legend };
  const grids = spec.floors.map((s) =>
    s
      .replace(/^\n/, "")
      .replace(/\n\s*$/, "")
      .split("\n"),
  );
  const width = Math.max(...grids.flat().map((r) => r.length));
  const depth = Math.max(...grids.map((g) => g.length));
  const entities: MapEntity[] = [];
  let lightN = 0;

  const floors = grids.map((rows, f) => {
    const raw = Array.from({ length: depth }, (_, z) => (rows[z] ?? "").padEnd(width, " "));
    const at = (x: number, z: number) => (x < 0 || z < 0 || x >= width || z >= depth ? "#" : raw[z][x]);
    /** Choose rotation so the object's back is against a wall/edge and it faces open floor. */
    const autoRot = (x: number, z: number) => {
      for (let r = 0; r < 4; r++) {
        const d = DIRS[r];
        const behind = at(x - d.x, z - d.z);
        const front = at(x + d.x, z + d.z);
        if (SOLIDISH.includes(behind) && !SOLIDISH.includes(front)) return r;
      }
      return 0;
    };
    /** Outward direction for a border exit. */
    const exitRot = (x: number, z: number) => {
      if (z === 0) return 0;
      if (x === width - 1) return 1;
      if (z === depth - 1) return 2;
      if (x === 0) return 3;
      for (let r = 0; r < 4; r++) {
        const d = DIRS[r];
        if (at(x + d.x, z + d.z) === " ") return r;
      }
      return 0;
    };
    /** Most common floor glyph around a cell. */
    const floorAround = (x: number, z: number) => {
      const counts: Record<string, number> = {};
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [-1, -1],
        [1, -1],
        [-1, 1],
      ]) {
        const ch = at(x + dx, z + dz);
        if (".,:".includes(ch)) counts[ch] = (counts[ch] ?? 0) + 1;
      }
      return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ".";
    };

    return raw.map((row, z) =>
      Array.from(row, (ch, x) => {
        const push = (e: Omit<MapEntity, "f" | "x" | "z">) => entities.push({ f, x, z, ...e });
        if (ch === "T") return push({ t: "terminal", r: autoRot(x, z) }), floorAround(x, z);
        if (ch === "P") return push({ t: "pod", r: autoRot(x, z) }), floorAround(x, z);
        if (ch === "S") return push({ t: "spawnS", r: 0 }), floorAround(x, z);
        if (ch === "H") return push({ t: "spawnH", r: 0 }), floorAround(x, z);
        if (ch === "*") return push({ t: "pickup" }), floorAround(x, z);
        if (ch === "L") {
          const c = spec.lightColors?.[lightN++ % spec.lightColors.length];
          return push({ t: "light", ...(c ? { c } : {}) }), floorAround(x, z);
        }
        if (ch === "E") return push({ t: "exit", r: exitRot(x, z) }), "#";
        if (ch in STAIR_GLYPH) return push({ t: "stairs", r: STAIR_GLYPH[ch] }), floorAround(x, z);
        if (/[a-z]/.test(ch) && legend[ch]) return push({ t: "prop", k: legend[ch], r: autoRot(x, z) }), floorAround(x, z);
        return ch;
      }).join(""),
    );
  });

  return {
    v: 1,
    id: spec.id,
    name: spec.name,
    description: spec.description,
    author: "Blackout Protocol",
    theme: spec.theme,
    width,
    depth,
    floors,
    entities,
    lighting: spec.lighting,
  };
}
