import type { MapDefinition } from "../types.js";
import { kestrel } from "./kestrel.js";

/** Built-in maps, in lobby display order. */
export const BUILTIN_MAPS: MapDefinition[] = [kestrel];
export const BUILTIN_MAP_IDS = BUILTIN_MAPS.map((m) => m.id);
export const getBuiltinMap = (id: string) => BUILTIN_MAPS.find((m) => m.id === id);
