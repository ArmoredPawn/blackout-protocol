import { z } from "zod";
import { MAX_PLAYERS } from "./constants.js";
import { defaultPowerupTuning, sanitizePowerupTuning, type PowerupTuning } from "./powerups.js";

/**
 * Room settings. The host edits these in the lobby; the server re-validates
 * every change with `sanitizeSettings` and broadcasts the result.
 */
export interface RoomSettings {
  maxPlayers: number;
  hunterCount: number;
  mapId: string; // built-in id or "custom"
  mapTier: number; // -1 = auto from player count, 0..3 fixed
  roundSeconds: number;
  intermissionSeconds: number;
  headStartSeconds: number;
  terminalsRequired: number; // 0 = auto
  hackSpeed: number;
  skillChecks: boolean;
  survivorSpeed: number;
  hunterSpeed: number;
  jumpEnabled: boolean;
  captureSeconds: number;
  rescueSeconds: number;
  downedRecoverSeconds: number;
  struggleEnabled: boolean;
  swingCooldown: number;
  exitOpenSeconds: number;
  hunterAbilitiesEnabled: boolean;
  survivorPowerupsEnabled: boolean;
  pickupIntervalSeconds: number;
  maxPickupSlots: number;
  hunterAbilityMode: "choose" | "random";
  powerups: Record<string, PowerupTuning>;
}

export interface NumberField {
  key: keyof RoomSettings;
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
  hint?: string;
  group: "general" | "hunter" | "survivor" | "map";
}

/** Single source of truth for numeric ranges (used by UI sliders and server clamps). */
export const NUMBER_FIELDS: NumberField[] = [
  { key: "maxPlayers", label: "Max players", min: 2, max: MAX_PLAYERS, step: 1, group: "general" },
  { key: "hunterCount", label: "Hunters", min: 1, max: 6, step: 1, group: "hunter", hint: "Capped so at least one Survivor remains" },
  { key: "roundSeconds", label: "Round length", min: 120, max: 1200, step: 30, unit: "s", group: "general" },
  { key: "intermissionSeconds", label: "Intermission", min: 5, max: 60, step: 1, unit: "s", group: "general" },
  { key: "headStartSeconds", label: "Survivor head start", min: 0, max: 30, step: 1, unit: "s", group: "general" },
  { key: "terminalsRequired", label: "Terminals required", min: 0, max: 24, step: 1, group: "map", hint: "0 = automatic for player count" },
  { key: "hackSpeed", label: "Hack speed", min: 0.4, max: 3, step: 0.1, unit: "×", group: "survivor" },
  { key: "survivorSpeed", label: "Survivor speed", min: 0.7, max: 1.5, step: 0.05, unit: "×", group: "survivor" },
  { key: "hunterSpeed", label: "Hunter speed", min: 0.7, max: 1.5, step: 0.05, unit: "×", group: "hunter" },
  { key: "captureSeconds", label: "Stasis pod timer", min: 15, max: 120, step: 5, unit: "s", group: "survivor" },
  { key: "rescueSeconds", label: "Rescue time", min: 1, max: 10, step: 0.5, unit: "s", group: "survivor" },
  { key: "downedRecoverSeconds", label: "Downed recovery", min: 5, max: 60, step: 1, unit: "s", group: "survivor" },
  { key: "swingCooldown", label: "Swing cooldown", min: 0.5, max: 4, step: 0.1, unit: "s", group: "hunter" },
  { key: "exitOpenSeconds", label: "Exit door open time", min: 2, max: 30, step: 1, unit: "s", group: "map" },
  { key: "pickupIntervalSeconds", label: "Powerup spawn interval", min: 10, max: 180, step: 5, unit: "s", group: "survivor" },
  { key: "maxPickupSlots", label: "Powerup slots", min: 1, max: 3, step: 1, group: "survivor" },
];

export const DEFAULT_SETTINGS: RoomSettings = {
  maxPlayers: 10,
  hunterCount: 1,
  mapId: "kestrel",
  mapTier: -1,
  roundSeconds: 480,
  intermissionSeconds: 10,
  headStartSeconds: 12,
  terminalsRequired: 0,
  hackSpeed: 1,
  skillChecks: true,
  survivorSpeed: 1,
  hunterSpeed: 1,
  jumpEnabled: true,
  captureSeconds: 45,
  rescueSeconds: 3,
  downedRecoverSeconds: 22,
  struggleEnabled: true,
  swingCooldown: 1.3,
  exitOpenSeconds: 8,
  hunterAbilitiesEnabled: true,
  survivorPowerupsEnabled: true,
  pickupIntervalSeconds: 35,
  maxPickupSlots: 2,
  hunterAbilityMode: "choose",
  powerups: defaultPowerupTuning(),
};

const BoolKeys = [
  "skillChecks",
  "jumpEnabled",
  "struggleEnabled",
  "hunterAbilitiesEnabled",
  "survivorPowerupsEnabled",
] as const satisfies readonly (keyof RoomSettings)[];

const MapIdSchema = z.string().regex(/^[a-z0-9_-]{1,32}$/);

/**
 * Merge a (possibly partial, possibly hostile) patch over current settings.
 * Every field is clamped / whitelisted; unknown keys are ignored.
 */
export function sanitizeSettings(patch: unknown, base: RoomSettings = DEFAULT_SETTINGS): RoomSettings {
  const src = (patch && typeof patch === "object" ? patch : {}) as Record<string, unknown>;
  const out: RoomSettings = { ...base, powerups: { ...base.powerups } };

  for (const f of NUMBER_FIELDS) {
    const v = src[f.key];
    if (typeof v === "number" && Number.isFinite(v)) {
      const stepped = Math.round(v / f.step) * f.step;
      (out as any)[f.key] = Math.min(f.max, Math.max(f.min, Number(stepped.toFixed(3))));
    }
  }
  for (const k of BoolKeys) if (typeof src[k] === "boolean") (out as any)[k] = src[k];

  if (MapIdSchema.safeParse(src.mapId).success) out.mapId = src.mapId as string;
  if (typeof src.mapTier === "number" && [-1, 0, 1, 2, 3].includes(src.mapTier)) out.mapTier = src.mapTier;
  if (src.hunterAbilityMode === "choose" || src.hunterAbilityMode === "random") out.hunterAbilityMode = src.hunterAbilityMode;
  if (src.powerups !== undefined) out.powerups = sanitizePowerupTuning({ ...base.powerups, ...(src.powerups as object) });
  else out.powerups = sanitizePowerupTuning(out.powerups);

  out.hunterCount = Math.min(out.hunterCount, Math.max(1, out.maxPlayers - 1));
  return out;
}

/** Hunter count actually used for a given number of participating players. */
export function effectiveHunterCount(settings: RoomSettings, players: number): number {
  if (players < 2) return 0;
  return Math.max(1, Math.min(settings.hunterCount, players - 1));
}

/** Map tier (0–3) from player count. */
export function tierForPlayers(players: number): number {
  if (players <= 5) return 0;
  if (players <= 10) return 1;
  if (players <= 15) return 2;
  return 3;
}

export const TIER_LABELS = ["Small (2–5)", "Medium (6–10)", "Large (11–15)", "Huge (16–20)"];

/** Terminals required: auto scales with survivors but never exceeds what the map offers. */
export function terminalsRequiredFor(settings: RoomSettings, survivors: number, available: number): number {
  const auto = Math.round(2 + survivors * 0.8);
  const want = settings.terminalsRequired > 0 ? settings.terminalsRequired : auto;
  return Math.max(1, Math.min(want, available));
}
