import {
  BASE_HUNTER_SPEED,
  BASE_SURVIVOR_SPEED,
  CRAWL_SPEED_FACTOR,
  DOWNED_SPEED_FACTOR,
  JUMP_VELOCITY,
  type PlayerStatus,
  type Role,
} from "./constants.js";
import type { RoomSettings } from "./settings.js";

/** Base solo hack time for one terminal at hack speed 1×. */
export const BASE_HACK_SECONDS = 26;
export const HUNTER_CARRY_SPEED = 0.92;
export const PICKUP_HOLD_SECONDS = 0.45;
export const POD_HOLD_SECONDS = 0.8;
export const STRUGGLE_PER_PRESS = 0.04;
export const PROTECT_SECONDS = 3;
export const SKILL_CHECK_MS = 1500;

/** Active effects are encoded as "id@endsAt,id@endsAt" (room-clock ms). */
export function parseEffects(s: string): Map<string, number> {
  const m = new Map<string, number>();
  if (!s) return m;
  for (const part of s.split(",")) {
    const [id, t] = part.split("@");
    if (id) m.set(id, Number(t) || 0);
  }
  return m;
}

export function encodeEffects(m: Map<string, number>): string {
  return Array.from(m, ([id, t]) => `${id}@${Math.round(t)}`).join(",");
}

export function hasEffect(effects: Map<string, number>, id: string, now: number) {
  const t = effects.get(id);
  return t !== undefined && t > now;
}

/** Movement speed (m/s) – used identically by client prediction and server validation. */
export function moveSpeed(
  role: Role | string,
  status: PlayerStatus | string,
  crawling: boolean,
  effects: Map<string, number>,
  now: number,
  settings: RoomSettings,
  carrying: boolean,
): number {
  if (status === "carried" || status === "podded" || status === "eliminated" || status === "escaped") return 0;
  if (hasEffect(effects, "rooted", now) || hasEffect(effects, "stunned", now)) return 0;
  const hunter = role === "hunter";
  let v = hunter ? BASE_HUNTER_SPEED * settings.hunterSpeed : BASE_SURVIVOR_SPEED * settings.survivorSpeed;
  if (status === "downed") return v * DOWNED_SPEED_FACTOR;
  if (crawling) v *= CRAWL_SPEED_FACTOR;
  if (carrying) v *= HUNTER_CARRY_SPEED;
  const tune = settings.powerups;
  if (hasEffect(effects, "adrenaline", now)) v *= tune.adrenaline?.magnitude ?? 1.45;
  if (hasEffect(effects, "lunge", now)) v *= tune.lunge?.magnitude ?? 3;
  if (hasEffect(effects, "sprint", now)) v *= tune.sprint?.magnitude ?? 1.4;
  if (hasEffect(effects, "rescued", now)) v *= 1.15;
  return v;
}

export function jumpVelocity(settings: RoomSettings, status: string, crawling: boolean) {
  return settings.jumpEnabled && status === "free" && !crawling ? JUMP_VELOCITY : 0;
}
