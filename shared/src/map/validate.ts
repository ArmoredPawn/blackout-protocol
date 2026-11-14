import { z } from "zod";
import { PROPS } from "./props.js";
import { MapRuntime } from "./runtime.js";
import {
  DIRS,
  MAX_ENTITIES,
  MAX_FLOORS,
  MAX_MAP_D,
  MAX_MAP_W,
  STAIR_LENGTH,
  TILE_CHARS,
  type MapDefinition,
} from "./types.js";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const EntitySchema = z
  .object({
    t: z.enum(["terminal", "pod", "exit", "spawnS", "spawnH", "stairs", "light", "prop", "pickup"]),
    f: z.number().int().min(0).max(MAX_FLOORS - 1),
    x: z.number().int().min(0).max(MAX_MAP_W - 1),
    z: z.number().int().min(0).max(MAX_MAP_D - 1),
    r: z.number().int().min(0).max(3).optional(),
    k: z.string().max(24).optional(),
    c: hex.optional(),
  })
  .strict();

const MapSchema = z
  .object({
    v: z.literal(1),
    id: z.string().regex(/^[a-z0-9_-]{1,32}$/),
    name: z.string().min(1).max(40),
    author: z.string().max(30).optional(),
    description: z.string().max(200).optional(),
    theme: z.enum(["facility", "industrial", "school", "underground", "mall", "warehouse", "custom"]),
    width: z.number().int().min(8).max(MAX_MAP_W),
    depth: z.number().int().min(8).max(MAX_MAP_D),
    floors: z.array(z.array(z.string().max(MAX_MAP_W)).max(MAX_MAP_D)).min(1).max(MAX_FLOORS),
    entities: z.array(EntitySchema).max(MAX_ENTITIES),
    lighting: z
      .object({
        ambient: hex,
        ambientIntensity: z.number().min(0).max(2),
        fog: hex,
        fogDensity: z.number().min(0).max(0.08),
        sky: hex,
        lamp: z.number().min(0).max(4),
      })
      .strict(),
  })
  .strict();

export interface MapValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  map?: MapDefinition;
  /** Per tier: counts of reachable gameplay objects. */
  tiers?: { terminals: number; pods: number; exits: number; spawnsS: number; spawnsH: number; pickups: number }[];
}

/** Strict validation for any map coming from users or files. Never throws. */
export function validateMap(input: unknown): MapValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  let parsed: MapDefinition;
  try {
    const r = MapSchema.safeParse(input);
    if (!r.success) {
      return { ok: false, errors: r.error.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`), warnings };
    }
    parsed = r.data as MapDefinition;
  } catch {
    return { ok: false, errors: ["Map data is not readable."], warnings };
  }

  // Normalise rows: pad/trim to width, replace unknown chars with void.
  const floors = parsed.floors.map((rows) => {
    const out: string[] = [];
    for (let zi = 0; zi < parsed.depth; zi++) {
      let row = (rows[zi] ?? "").slice(0, parsed.width).padEnd(parsed.width, " ");
      row = Array.from(row, (ch) => (TILE_CHARS.includes(ch) ? ch : " ")).join("");
      out.push(row);
    }
    return out;
  });
  const map: MapDefinition = { ...parsed, floors };

  for (const e of map.entities) {
    if (e.x >= map.width || e.z >= map.depth || e.f >= floors.length) {
      errors.push(`Entity ${e.t} at (${e.x},${e.z}) floor ${e.f} is outside the map.`);
      continue;
    }
    if (e.t === "prop" && (!e.k || !PROPS[e.k])) errors.push(`Unknown prop "${e.k}".`);
    if (e.t === "exit") {
      const ch = floors[e.f][e.z][e.x];
      if (ch !== "#") errors.push(`Exit at (${e.x},${e.z}) must be placed on a wall tile.`);
      const d = DIRS[(e.r ?? 0) & 3];
      const ix = e.x - d.x,
        iz = e.z - d.z;
      const inside = floors[e.f][iz]?.[ix];
      if (!inside || !".,:D".includes(inside)) errors.push(`Exit at (${e.x},${e.z}) needs walkable floor on its inner side.`);
    }
    if (e.t === "stairs") {
      const d = DIRS[(e.r ?? 0) & 3];
      if (e.f + 1 >= floors.length) errors.push(`Stairs at (${e.x},${e.z}) lead to a floor that doesn't exist.`);
      const tx = e.x + d.x * STAIR_LENGTH,
        tz = e.z + d.z * STAIR_LENGTH;
      if (tx < 0 || tz < 0 || tx >= map.width || tz >= map.depth) errors.push(`Stairs at (${e.x},${e.z}) run off the map.`);
    }
  }
  if (map.entities.filter((e) => e.t === "light").length > 400) errors.push("Too many lights (max 400).");
  if (!map.entities.some((e) => e.t === "spawnS")) errors.push("Add at least one Survivor spawn.");
  if (!map.entities.some((e) => e.t === "spawnH")) errors.push("Add at least one Hunter spawn.");
  if (errors.length) return { ok: false, errors: errors.slice(0, 12), warnings };

  // Gameplay checks per tier via the runtime (reachability from the first survivor spawn).
  const tiers: NonNullable<MapValidation["tiers"]> = [];
  try {
    for (let tier = 0; tier <= 3; tier++) {
      const rt = new MapRuntime(map, tier);
      tiers.push({
        terminals: rt.terminals.length,
        pods: rt.pods.length,
        exits: rt.exits.length,
        spawnsS: rt.spawnsS.length,
        spawnsH: rt.spawnsH.length,
        pickups: rt.pickups.length,
      });
    }
  } catch {
    return { ok: false, errors: ["Map could not be built."], warnings };
  }
  const t0 = tiers[0];
  if (t0.terminals < 2) errors.push("At least 2 terminals must be reachable from the first Survivor spawn.");
  if (t0.pods < 1) errors.push("At least 1 stasis pod must be reachable.");
  if (t0.exits < 1) errors.push("At least 1 exit door must be reachable.");
  if (t0.spawnsH < 1) warnings.push("No Hunter spawn is reachable; Hunters will start at a Survivor spawn.");
  if (tiers[3].terminals < 5) warnings.push("Large lobbies work best with 5+ terminals.");
  if (t0.pickups === 0) warnings.push("No powerup spawn points – Survivor powerups won't appear.");

  return { ok: errors.length === 0, errors, warnings, map, tiers };
}
