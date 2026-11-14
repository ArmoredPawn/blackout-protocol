/**
 * Portable map format (v1). Used by built-in maps, the editor, file
 * import/export and share codes. Always run through `validateMap` before use.
 *
 * Tiles (one char per cell, one string per row, one row-array per floor):
 *   ' ' void (no floor – open to the floor below, or outside on floor 0)
 *   '.' floor          ',' floor (alt material)   ':' floor (grate / accent)
 *   '#' wall           'G' glass wall             'W' low wall (≈1.1 m, can be jumped onto)
 *   'D' doorway        'V' vent (crawl only)
 *   '1' '2' '3'        tier gate: solid wall until the map tier ≥ n, then a doorway
 */

export type ThemeId = "facility" | "industrial" | "school" | "underground" | "mall" | "warehouse" | "custom";

export type EntityType =
  | "terminal"
  | "pod"
  | "exit"
  | "spawnS"
  | "spawnH"
  | "stairs"
  | "light"
  | "prop"
  | "pickup";

export interface MapEntity {
  t: EntityType;
  f: number; // floor index
  x: number; // column
  z: number; // row
  r?: number; // rotation 0..3 (0 = facing -z / "north")
  k?: string; // prop kind
  c?: string; // light colour
}

export interface MapLighting {
  ambient: string;
  ambientIntensity: number; // 0..2
  fog: string;
  fogDensity: number; // 0..0.08
  sky: string;
  /** Intensity of fixture (point) lights. */
  lamp: number;
}

export interface MapDefinition {
  v: 1;
  id: string;
  name: string;
  author?: string;
  description?: string;
  theme: ThemeId;
  width: number; // columns
  depth: number; // rows
  floors: string[][];
  entities: MapEntity[];
  lighting: MapLighting;
}

export const TILE_CHARS = " .,:#GWDV123";
export const MAX_MAP_W = 96;
export const MAX_MAP_D = 96;
export const MAX_FLOORS = 3;
export const MAX_ENTITIES = 1500;

export const DIRS = [
  { x: 0, z: -1 },
  { x: 1, z: 0 },
  { x: 0, z: 1 },
  { x: -1, z: 0 },
] as const;

export const yawForRot = (r = 0) => Math.atan2(DIRS[r & 3].x, DIRS[r & 3].z);

export const STAIR_LENGTH = 3;
