import { CELL, CRAWL_HEIGHT, GRAVITY, PLAYER_HEIGHT, PLAYER_RADIUS, STEP_HEIGHT } from "./constants.js";
import type { Box, MapRuntime } from "./map/runtime.js";

/**
 * Deterministic character movement shared by the client (prediction) and the
 * server (validation). Pure functions over plain objects.
 */
export interface BodyState {
  x: number;
  y: number;
  z: number;
  vy: number;
  grounded: boolean;
  crawling: boolean;
}

export interface MoveInput {
  /** Desired horizontal direction in world space (length ≤ 1). */
  dx: number;
  dz: number;
  jump: boolean;
  crawl: boolean;
  speed: number; // metres / second for this frame (already includes role, crawl, effects)
  jumpVelocity: number; // 0 disables jump
}

const scratch: Box[] = [];

export function bodyHeight(crawling: boolean) {
  return crawling ? CRAWL_HEIGHT : PLAYER_HEIGHT;
}

/** Highest walkable surface under (x, z) that is at or below y + STEP_HEIGHT. */
export function groundHeight(map: MapRuntime, x: number, y: number, z: number, openExits = 0): number {
  let best = -Infinity;
  const probe = PLAYER_RADIUS * 0.55;
  const boxes = map.boxesNear(x, z, probe, scratch);
  for (const b of boxes) {
    if (b.exit !== undefined && openExits & (1 << b.exit)) continue;
    if (x + probe <= b.minX || x - probe >= b.maxX || z + probe <= b.minZ || z - probe >= b.maxZ) continue;
    if (b.maxY <= y + STEP_HEIGHT + 1e-3 && b.maxY > best) best = b.maxY;
  }
  return best;
}

function blocksAt(b: Box, y: number, h: number, grounded: boolean) {
  // A box blocks horizontally if it overlaps our vertical span and is too tall to step onto.
  const step = grounded ? STEP_HEIGHT : 0.12;
  return b.maxY > y + step && b.minY < y + h - 0.02;
}

/** Push the circle out of every blocking box. Returns true if any collision happened. */
export function resolveHorizontal(map: MapRuntime, s: BodyState, openExits = 0): boolean {
  const h = bodyHeight(s.crawling);
  const r = PLAYER_RADIUS;
  let hit = false;
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    const boxes = map.boxesNear(s.x, s.z, r + 0.05, scratch);
    for (const b of boxes) {
      if (b.exit !== undefined && openExits & (1 << b.exit)) continue;
      if (!blocksAt(b, s.y, h, s.grounded)) continue;
      const cx = Math.max(b.minX, Math.min(s.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(s.z, b.maxZ));
      let ddx = s.x - cx,
        ddz = s.z - cz;
      const d2 = ddx * ddx + ddz * ddz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-10) {
        const d = Math.sqrt(d2);
        const push = r - d;
        s.x += (ddx / d) * push;
        s.z += (ddz / d) * push;
      } else {
        // Centre inside box: push out along the smallest axis.
        const left = s.x - b.minX,
          right = b.maxX - s.x,
          back = s.z - b.minZ,
          front = b.maxZ - s.z;
        const m = Math.min(left, right, back, front);
        if (m === left) s.x = b.minX - r;
        else if (m === right) s.x = b.maxX + r;
        else if (m === back) s.z = b.minZ - r;
        else s.z = b.maxZ + r;
        ddx = ddz = 0;
      }
      moved = hit = true;
    }
    if (!moved) break;
  }
  // Hard map bounds.
  const W = map.width * CELL,
    D = map.depth * CELL;
  s.x = Math.max(r, Math.min(W - r, s.x));
  s.z = Math.max(r, Math.min(D - r, s.z));
  return hit;
}

/** True if a standing body would fit at the current position (used to stand up from crawling). */
export function canStand(map: MapRuntime, s: BodyState, openExits = 0): boolean {
  const boxes = map.boxesNear(s.x, s.z, PLAYER_RADIUS, scratch);
  for (const b of boxes) {
    if (b.exit !== undefined && openExits & (1 << b.exit)) continue;
    if (s.x + PLAYER_RADIUS <= b.minX || s.x - PLAYER_RADIUS >= b.maxX) continue;
    if (s.z + PLAYER_RADIUS <= b.minZ || s.z - PLAYER_RADIUS >= b.maxZ) continue;
    if (b.minY < s.y + PLAYER_HEIGHT && b.minY > s.y + CRAWL_HEIGHT - 0.05) return false;
  }
  return true;
}

/** Advance one simulation step. Large dt is sub-stepped for stability. */
export function stepBody(map: MapRuntime, s: BodyState, inp: MoveInput, dt: number, openExits = 0): void {
  const sub = Math.max(1, Math.ceil(dt / (1 / 60)));
  const h = dt / sub;
  for (let i = 0; i < sub; i++) step(map, s, inp, h, openExits);
}

function step(map: MapRuntime, s: BodyState, inp: MoveInput, dt: number, openExits: number) {
  // Crawl state: standing up requires head clearance.
  if (inp.crawl) s.crawling = true;
  else if (s.crawling && canStand(map, s, openExits)) s.crawling = false;

  const len = Math.hypot(inp.dx, inp.dz);
  const nx = len > 1 ? inp.dx / len : inp.dx;
  const nz = len > 1 ? inp.dz / len : inp.dz;
  s.x += nx * inp.speed * dt;
  s.z += nz * inp.speed * dt;
  resolveHorizontal(map, s, openExits);

  if (inp.jump && s.grounded && !s.crawling && inp.jumpVelocity > 0) {
    s.vy = inp.jumpVelocity;
    s.grounded = false;
  }

  const prevY = s.y;
  s.vy -= GRAVITY * dt;
  if (s.vy < -40) s.vy = -40;
  s.y += s.vy * dt;

  // Ceiling.
  if (s.vy > 0) {
    const hgt = bodyHeight(s.crawling);
    const boxes = map.boxesNear(s.x, s.z, PLAYER_RADIUS * 0.5, scratch);
    for (const b of boxes) {
      if (b.exit !== undefined && openExits & (1 << b.exit)) continue;
      if (s.x <= b.minX || s.x >= b.maxX || s.z <= b.minZ || s.z >= b.maxZ) continue;
      if (b.minY >= prevY + hgt - 0.01 && s.y + hgt > b.minY) {
        s.y = b.minY - hgt;
        s.vy = 0;
      }
    }
  }

  const g = groundHeight(map, s.x, Math.max(prevY, s.y), s.z, openExits);
  if (s.y <= g + 1e-4) {
    s.y = g;
    s.vy = 0;
    s.grounded = true;
  } else if (s.grounded && s.vy <= 0 && s.y - g < STEP_HEIGHT + 0.05) {
    // Snap down small steps (stairs) instead of hopping.
    s.y = g;
    s.vy = 0;
  } else {
    s.grounded = false;
  }
}

/** Server-side: is a reported position plausibly free of solids? */
export function positionIsClear(map: MapRuntime, x: number, y: number, z: number, crawling: boolean, openExits = 0): boolean {
  const h = bodyHeight(crawling);
  const r = PLAYER_RADIUS * 0.7; // tolerance for float drift / interpolation
  const boxes = map.boxesNear(x, z, r, scratch);
  for (const b of boxes) {
    if (b.exit !== undefined && openExits & (1 << b.exit)) continue;
    if (b.maxY <= y + STEP_HEIGHT || b.minY >= y + h - 0.05) continue;
    const cx = Math.max(b.minX, Math.min(x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
    if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return false;
  }
  return x >= 0 && z >= 0 && x <= map.width * CELL && z <= map.depth * CELL;
}

/** Server-side: does the straight segment between two positions pass through a wall? */
export function segmentIsClear(
  map: MapRuntime,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  crawling: boolean,
  openExits = 0,
): boolean {
  const dist = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(1, Math.ceil(dist / 0.3));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    // Use the higher of the two endpoint heights so stepping up stairs isn't flagged.
    const y = Math.max(ay, by);
    if (!positionIsClear(map, ax + (bx - ax) * t, y, az + (bz - az) * t, crawling, openExits))
      return false;
  }
  return true;
}
