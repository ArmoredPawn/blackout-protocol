import { DIRS, MAX_FLOORS, MAX_MAP_D, MAX_MAP_W, type EntityType, type MapDefinition, type MapEntity, type ThemeId } from "@bp/shared";

/** Pure map-editing operations. Every function returns a new MapDefinition. */

export const SOLID_CHARS = "#GW123";

export function blankMap(name = "My Map", w = 32, d = 24, theme: ThemeId = "facility"): MapDefinition {
  const rows: string[] = [];
  for (let z = 0; z < d; z++) {
    let r = "";
    for (let x = 0; x < w; x++) r += x === 0 || z === 0 || x === w - 1 || z === d - 1 ? "#" : ".";
    rows.push(r);
  }
  return {
    v: 1,
    id: "custom",
    name,
    author: "",
    description: "",
    theme,
    width: w,
    depth: d,
    floors: [rows],
    entities: [],
    lighting: { ambient: "#a8b8d8", ambientIntensity: 0.55, fog: "#0a0e16", fogDensity: 0.02, sky: "#05070c", lamp: 1.4 },
  };
}

export function clone(m: MapDefinition): MapDefinition {
  return { ...m, floors: m.floors.map((f) => [...f]), entities: m.entities.map((e) => ({ ...e })), lighting: { ...m.lighting } };
}

export function charAt(m: MapDefinition, f: number, x: number, z: number) {
  if (x < 0 || z < 0 || x >= m.width || z >= m.depth) return "#";
  return m.floors[f]?.[z]?.[x] ?? " ";
}

function setChars(m: MapDefinition, f: number, cells: [number, number, string][]): MapDefinition {
  const out = clone(m);
  const rows = out.floors[f].map((r) => r.padEnd(m.width, " ").split(""));
  for (const [x, z, ch] of cells) if (x >= 0 && z >= 0 && x < m.width && z < m.depth) rows[z][x] = ch;
  out.floors[f] = rows.map((r) => r.join(""));
  return out;
}

export function paint(m: MapDefinition, f: number, cells: [number, number][], ch: string): MapDefinition {
  let out = setChars(m, f, cells.map(([x, z]) => [x, z, ch]));
  // Solid tiles can't hold objects (except exits, which live in walls).
  if (SOLID_CHARS.includes(ch) || ch === " ") {
    const set = new Set(cells.map(([x, z]) => `${x},${z}`));
    out.entities = out.entities.filter((e) => e.f !== f || !set.has(`${e.x},${e.z}`) || (e.t === "exit" && ch === "#"));
  }
  return out;
}

export function rectCells(x0: number, z0: number, x1: number, z1: number): [number, number][] {
  const out: [number, number][] = [];
  for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) out.push([x, z]);
  return out;
}

/** Room: walls on the border (keeping existing doors/gates), floor inside. */
export function room(m: MapDefinition, f: number, x0: number, z0: number, x1: number, z1: number, floor = "."): MapDefinition {
  const ax = Math.min(x0, x1),
    bx = Math.max(x0, x1),
    az = Math.min(z0, z1),
    bz = Math.max(z0, z1);
  const cells: [number, number, string][] = [];
  for (let z = az; z <= bz; z++)
    for (let x = ax; x <= bx; x++) {
      const border = x === ax || x === bx || z === az || z === bz;
      if (border) {
        const cur = charAt(m, f, x, z);
        cells.push([x, z, "D123".includes(cur) ? cur : "#"]);
      } else cells.push([x, z, floor]);
    }
  const out = setChars(m, f, cells);
  // Objects on the new walls are removed (exits are allowed in walls).
  const border = new Set(cells.filter(([, , ch]) => ch === "#").map(([x, z]) => `${x},${z}`));
  out.entities = out.entities.filter((e) => e.f !== f || e.t === "exit" || !border.has(`${e.x},${e.z}`));
  return out;
}

/** Rotation so an object's back is against a wall and it faces open floor. */
export function autoRot(m: MapDefinition, f: number, x: number, z: number): number {
  for (let r = 0; r < 4; r++) {
    const d = DIRS[r];
    if (SOLID_CHARS.includes(charAt(m, f, x - d.x, z - d.z)) && !SOLID_CHARS.includes(charAt(m, f, x + d.x, z + d.z))) return r;
  }
  return 0;
}

/** Exits face outward: toward the map edge or a void cell. */
export function exitRot(m: MapDefinition, f: number, x: number, z: number): number {
  if (z === 0) return 0;
  if (x === m.width - 1) return 1;
  if (z === m.depth - 1) return 2;
  if (x === 0) return 3;
  for (let r = 0; r < 4; r++) {
    const d = DIRS[r];
    if (charAt(m, f, x + d.x, z + d.z) === " ") return r;
  }
  return autoRot(m, f, x, z);
}

export function entityAt(m: MapDefinition, f: number, x: number, z: number): MapEntity | undefined {
  return m.entities.find((e) => e.f === f && e.x === x && e.z === z);
}

export function placeEntity(m: MapDefinition, e: MapEntity): MapDefinition {
  let out = clone(m);
  out.entities = out.entities.filter((o) => !(o.f === e.f && o.x === e.x && o.z === e.z));
  if (e.t === "exit") {
    out = setChars(out, e.f, [[e.x, e.z, "#"]]);
  } else {
    const ch = charAt(out, e.f, e.x, e.z);
    if (SOLID_CHARS.includes(ch) || ch === " " || ch === "V") out = setChars(out, e.f, [[e.x, e.z, "."]]);
  }
  out.entities.push(e);
  return out;
}

export function removeEntityAt(m: MapDefinition, f: number, x: number, z: number): MapDefinition {
  const out = clone(m);
  out.entities = out.entities.filter((e) => !(e.f === f && e.x === x && e.z === z));
  return out;
}

export function rotateEntityAt(m: MapDefinition, f: number, x: number, z: number): MapDefinition {
  const out = clone(m);
  const e = out.entities.find((o) => o.f === f && o.x === x && o.z === z);
  if (e) e.r = ((e.r ?? 0) + 1) % 4;
  return out;
}

export function resize(m: MapDefinition, w: number, d: number): MapDefinition {
  w = Math.max(12, Math.min(MAX_MAP_W, Math.round(w)));
  d = Math.max(12, Math.min(MAX_MAP_D, Math.round(d)));
  const out = clone(m);
  out.width = w;
  out.depth = d;
  out.floors = m.floors.map((rows, f) =>
    Array.from({ length: d }, (_, z) => {
      const src = rows[z] ?? "";
      let r = "";
      for (let x = 0; x < w; x++) r += x < m.width && z < m.depth ? (src[x] ?? " ") : f === 0 ? "#" : " ";
      return r;
    }),
  );
  out.entities = out.entities.filter((e) => e.x < w && e.z < d);
  return out;
}

export function addFloor(m: MapDefinition): MapDefinition {
  if (m.floors.length >= MAX_FLOORS) return m;
  const out = clone(m);
  out.floors.push(Array.from({ length: m.depth }, () => " ".repeat(m.width)));
  return out;
}

export function removeFloor(m: MapDefinition, f: number): MapDefinition {
  if (m.floors.length <= 1 || f === 0) return m;
  const out = clone(m);
  out.floors.splice(f, 1);
  out.entities = out.entities.filter((e) => e.f !== f).map((e) => (e.f > f ? { ...e, f: e.f - 1 } : e));
  return out;
}

export const OBJECT_TOOLS: { t: EntityType; label: string; color: string; glyph: string; hint: string }[] = [
  { t: "terminal", label: "Terminal", color: "#3aa8ff", glyph: "T", hint: "Survivors hack these" },
  { t: "pod", label: "Stasis pod", color: "#ff4d5e", glyph: "P", hint: "Hunters capture Survivors here" },
  { t: "exit", label: "Exit door", color: "#ffd84a", glyph: "E", hint: "Place on an outer wall" },
  { t: "spawnS", label: "Survivor spawn", color: "#4ad6ff", glyph: "S", hint: "First one decides what's reachable" },
  { t: "spawnH", label: "Hunter spawn", color: "#ff7a5a", glyph: "H", hint: "" },
  { t: "pickup", label: "Powerup spawn", color: "#ffb000", glyph: "*", hint: "Survivor powerups appear here" },
  { t: "light", label: "Ceiling light", color: "#fff4c8", glyph: "L", hint: "" },
  { t: "stairs", label: "Stairs", color: "#c8d2e6", glyph: "^", hint: "3 cells long; the floor above must be empty there" },
];
