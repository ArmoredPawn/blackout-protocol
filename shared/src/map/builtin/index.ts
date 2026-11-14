import type { MapDefinition } from "../types.js";
import { kestrel } from "./kestrel.js";
import { foundry } from "./foundry.js";
import { hillcrest } from "./hillcrest.js";
import { deepcore } from "./deepcore.js";
import { galleria } from "./galleria.js";
import { harbor } from "./harbor.js";

/** Built-in maps, in lobby display order. */
export const BUILTIN_MAPS: MapDefinition[] = [kestrel, foundry, hillcrest, deepcore, galleria, harbor];
export const BUILTIN_MAP_IDS = BUILTIN_MAPS.map((m) => m.id);
export const getBuiltinMap = (id: string) => BUILTIN_MAPS.find((m) => m.id === id);
