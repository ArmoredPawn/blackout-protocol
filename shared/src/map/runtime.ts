import { CELL, FLOOR_H, VENT_CLEARANCE } from "../constants.js";
import { OBJECT_SOLIDS, PROPS } from "./props.js";
import { DIRS, STAIR_LENGTH, type MapDefinition, type MapEntity } from "./types.js";

export enum Tile {
  Void = 0,
  Floor = 1,
  FloorAlt = 2,
  FloorGrate = 3,
  Wall = 4,
  Glass = 5,
  Low = 6,
  Door = 7,
  Vent = 8,
  GateClosed = 9,
  GateOpen = 10,
}

export const LOW_WALL_H = 1.1;
export const LINTEL_Y = 2.7;
const SLAB = 0.25;

export interface Box {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  /** Exit door index; box is ignored while that exit is open. */
  exit?: number;
  seeThrough?: boolean;
}

export interface PlacedEntity extends MapEntity {
  id: string;
  /** World-space centre. */
  wx: number;
  wy: number;
  wz: number;
  tier: number;
}

export interface ExitPlaced extends PlacedEntity {
  /** Point survivors stand at to open the door (inside cell centre). */
  ix: number;
  iz: number;
  index: number;
}

export function charToTile(ch: string, tier: number): Tile {
  switch (ch) {
    case ".":
      return Tile.Floor;
    case ",":
      return Tile.FloorAlt;
    case ":":
      return Tile.FloorGrate;
    case "#":
      return Tile.Wall;
    case "G":
      return Tile.Glass;
    case "W":
      return Tile.Low;
    case "D":
      return Tile.Door;
    case "V":
      return Tile.Vent;
    case "1":
    case "2":
    case "3":
      return tier >= Number(ch) ? Tile.GateOpen : Tile.GateClosed;
    default:
      return Tile.Void;
  }
}

export const isWalkableTile = (t: Tile) =>
  t === Tile.Floor || t === Tile.FloorAlt || t === Tile.FloorGrate || t === Tile.Door || t === Tile.Vent || t === Tile.GateOpen;

export const cellCenter = (c: number) => (c + 0.5) * CELL;

/** Rotated footprint half-extents. */
export function footprint(w: number, d: number, r = 0) {
  return r % 2 === 0 ? { hx: w / 2, hz: d / 2 } : { hx: d / 2, hz: w / 2 };
}

/** Centre of a placed object's footprint, shifted toward its back wall by `back` (0..1). */
export function propCenter(p: { wx: number; wz: number; r?: number }, w: number, d: number, back: number) {
  const dir = DIRS[(p.r ?? 0) & 3];
  const off = (CELL / 2 - Math.min(w, d) / 2) * back;
  return { cx: p.wx - dir.x * off, cz: p.wz - dir.z * off };
}

export class MapRuntime {
  readonly def: MapDefinition;
  readonly tier: number;
  readonly width: number;
  readonly depth: number;
  readonly floorCount: number;
  readonly tiles: Uint8Array[]; // per floor, row-major (z * width + x)
  private readonly cellBoxes: Box[][];
  readonly terminals: PlacedEntity[] = [];
  readonly pods: PlacedEntity[] = [];
  readonly exits: ExitPlaced[] = [];
  readonly spawnsS: PlacedEntity[] = [];
  readonly spawnsH: PlacedEntity[] = [];
  readonly pickups: PlacedEntity[] = [];
  readonly stairs: PlacedEntity[] = [];
  readonly lights: PlacedEntity[] = [];
  readonly props: PlacedEntity[] = [];
  /** Minimum tier at which each floor cell is reachable (255 = never). */
  readonly reachTier: Uint8Array[];

  constructor(def: MapDefinition, tier: number) {
    this.def = def;
    this.tier = tier;
    this.width = def.width;
    this.depth = def.depth;
    this.floorCount = def.floors.length;
    this.tiles = def.floors.map((rows) => {
      const arr = new Uint8Array(def.width * def.depth);
      for (let z = 0; z < def.depth; z++) {
        const row = rows[z] ?? "";
        for (let x = 0; x < def.width; x++) arr[z * def.width + x] = charToTile(row[x] ?? " ", tier);
      }
      return arr;
    });
    this.cellBoxes = Array.from({ length: def.width * def.depth }, () => []);
    this.reachTier = this.computeReachTiers(def);
    this.buildTileBoxes();
    this.placeEntities(def);
  }

  inBounds(x: number, z: number) {
    return x >= 0 && z >= 0 && x < this.width && z < this.depth;
  }

  tileAt(f: number, x: number, z: number): Tile {
    if (f < 0 || f >= this.floorCount || !this.inBounds(x, z)) return Tile.Void;
    return this.tiles[f][z * this.width + x] as Tile;
  }

  /** Tile kind at a world position for the floor implied by height y. */
  floorOf(y: number) {
    return Math.max(0, Math.min(this.floorCount - 1, Math.floor((y + 0.6) / FLOOR_H)));
  }

  private addBox(b: Box) {
    const x0 = Math.max(0, Math.floor(b.minX / CELL));
    const x1 = Math.min(this.width - 1, Math.floor((b.maxX - 1e-6) / CELL));
    const z0 = Math.max(0, Math.floor(b.minZ / CELL));
    const z1 = Math.min(this.depth - 1, Math.floor((b.maxZ - 1e-6) / CELL));
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.cellBoxes[z * this.width + x].push(b);
  }

  private buildTileBoxes() {
    for (let f = 0; f < this.floorCount; f++) {
      const base = f * FLOOR_H;
      for (let z = 0; z < this.depth; z++) {
        for (let x = 0; x < this.width; x++) {
          const t = this.tileAt(f, x, z);
          const minX = x * CELL,
            maxX = minX + CELL,
            minZ = z * CELL,
            maxZ = minZ + CELL;
          const box = (minY: number, maxY: number, extra?: Partial<Box>) =>
            this.addBox({ minX, maxX, minZ, maxZ, minY, maxY, ...extra });
          if (t === Tile.Void) continue;
          // Floor slab under everything that isn't void.
          box(base - SLAB, base);
          switch (t) {
            case Tile.Wall:
            case Tile.GateClosed:
              box(base, base + FLOOR_H - SLAB);
              break;
            case Tile.Glass:
              box(base, base + FLOOR_H - SLAB, { seeThrough: true });
              break;
            case Tile.Low:
              box(base, base + LOW_WALL_H);
              break;
            case Tile.Door:
            case Tile.GateOpen:
              box(base + LINTEL_Y, base + FLOOR_H - SLAB);
              break;
            case Tile.Vent:
              box(base + VENT_CLEARANCE, base + FLOOR_H - SLAB);
              break;
          }
        }
      }
    }
  }

  /** Bottleneck BFS: the smallest tier at which each walkable cell is reachable from the first survivor spawn. */
  private computeReachTiers(def: MapDefinition): Uint8Array[] {
    const W = def.width,
      D = def.depth,
      F = def.floors.length;
    const out = Array.from({ length: F }, () => new Uint8Array(W * D).fill(255));
    const start = def.entities.find((e) => e.t === "spawnS");
    if (!start) return out;
    const stairLinks = new Map<number, number[]>();
    const key = (f: number, x: number, z: number) => (f * D + z) * W + x;
    const link = (a: number, b: number) => {
      if (!stairLinks.has(a)) stairLinks.set(a, []);
      stairLinks.get(a)!.push(b);
    };
    for (const s of def.entities) {
      if (s.t !== "stairs") continue;
      const d = DIRS[(s.r ?? 0) & 3];
      const bottom = key(s.f, s.x - d.x, s.z - d.z);
      const first = key(s.f, s.x, s.z);
      const top = key(s.f + 1, s.x + d.x * STAIR_LENGTH, s.z + d.z * STAIR_LENGTH);
      link(first, top);
      link(top, first);
      link(bottom, first);
    }
    const rawChar = (f: number, x: number, z: number) => def.floors[f]?.[z]?.[x] ?? " ";
    for (let tier = 0; tier <= 3; tier++) {
      const seen = new Uint8Array(W * D * F);
      const queue: number[] = [key(start.f, start.x, start.z)];
      seen[queue[0]] = 1;
      while (queue.length) {
        const k = queue.pop()!;
        const f = Math.floor(k / (W * D));
        const rem = k % (W * D);
        const z = Math.floor(rem / W),
          x = rem % W;
        if (out[f][rem] > tier) out[f][rem] = tier;
        const visit = (nf: number, nx: number, nz: number) => {
          if (nf < 0 || nf >= F || nx < 0 || nz < 0 || nx >= W || nz >= D) return;
          const nk = key(nf, nx, nz);
          if (seen[nk]) return;
          if (!isWalkableTile(charToTile(rawChar(nf, nx, nz), tier))) return;
          seen[nk] = 1;
          queue.push(nk);
        };
        visit(f, x + 1, z);
        visit(f, x - 1, z);
        visit(f, x, z + 1);
        visit(f, x, z - 1);
        for (const n of stairLinks.get(k) ?? []) {
          const nf = Math.floor(n / (W * D));
          const r2 = n % (W * D);
          visit(nf, r2 % W, Math.floor(r2 / W));
        }
      }
    }
    return out;
  }

  /** Tier at which an entity becomes reachable (its own cell or any neighbour). */
  private entityTier(e: MapEntity): number {
    const rt = this.reachTier[e.f];
    if (!rt) return 255;
    let best = 255;
    for (const [dx, dz] of [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const x = e.x + dx,
        z = e.z + dz;
      if (this.inBounds(x, z)) best = Math.min(best, rt[z * this.width + x]);
    }
    return best;
  }

  private placeEntities(def: MapDefinition) {
    const counters: Record<string, number> = {};
    for (const e of def.entities) {
      const tier = e.t === "prop" || e.t === "light" || e.t === "stairs" ? 0 : this.entityTier(e);
      if (tier > this.tier) continue;
      const r = (e.r ?? 0) & 3;
      const n = (counters[e.t] = (counters[e.t] ?? -1) + 1);
      const p: PlacedEntity = {
        ...e,
        r,
        id: `${e.t}${n}`,
        wx: cellCenter(e.x),
        wy: e.f * FLOOR_H,
        wz: cellCenter(e.z),
        tier,
      };
      switch (e.t) {
        case "terminal":
          this.terminals.push(p);
          this.addSolid(p, OBJECT_SOLIDS.terminal.w, OBJECT_SOLIDS.terminal.d, OBJECT_SOLIDS.terminal.h, 0.25);
          break;
        case "pod":
          this.pods.push(p);
          this.addSolid(p, OBJECT_SOLIDS.pod.w, OBJECT_SOLIDS.pod.d, OBJECT_SOLIDS.pod.h, 0);
          break;
        case "exit": {
          const d = DIRS[r];
          const index = this.exits.length;
          const ex: ExitPlaced = {
            ...p,
            index,
            ix: cellCenter(e.x - d.x),
            iz: cellCenter(e.z - d.z),
          };
          this.exits.push(ex);
          // The wall at the exit cell becomes passable when the exit opens.
          const list = this.cellBoxes[e.z * this.width + e.x];
          for (const b of list) if (b.maxY - b.minY > 1 && b.minY >= e.f * FLOOR_H - 0.01) b.exit = index;
          break;
        }
        case "spawnS":
          this.spawnsS.push(p);
          break;
        case "spawnH":
          this.spawnsH.push(p);
          break;
        case "pickup":
          this.pickups.push(p);
          break;
        case "stairs":
          this.stairs.push(p);
          this.addStairs(p);
          break;
        case "light":
          this.lights.push(p);
          break;
        case "prop": {
          this.props.push(p);
          const pd = e.k ? PROPS[e.k] : undefined;
          if (pd?.solid) this.addSolid(p, pd.w, pd.d, pd.h, pd.back ?? 0);
          break;
        }
      }
    }
  }

  /** Axis-aligned solid for a placed object; `back` shifts it toward the back wall. */
  private addSolid(p: PlacedEntity, w: number, d: number, h: number, back: number) {
    const { hx, hz } = footprint(w, d, p.r);
    const { cx, cz } = propCenter(p, w, d, back);
    this.addBox({ minX: cx - hx, maxX: cx + hx, minZ: cz - hz, maxZ: cz + hz, minY: p.wy, maxY: p.wy + h });
  }

  /** Stairs = 8 solid steps across STAIR_LENGTH cells rising one storey in direction r. */
  private addStairs(p: PlacedEntity) {
    const steps = 8;
    const dir = DIRS[p.r ?? 0];
    const len = STAIR_LENGTH * CELL;
    // Start edge of the first cell, in the travel direction.
    const sx = p.wx - (dir.x * CELL) / 2;
    const sz = p.wz - (dir.z * CELL) / 2;
    const half = CELL / 2;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * len,
        b = ((i + 1) / steps) * len;
      const x0 = sx + dir.x * a,
        x1 = sx + dir.x * b;
      const z0 = sz + dir.z * a,
        z1 = sz + dir.z * b;
      const minX = dir.x !== 0 ? Math.min(x0, x1) : p.wx - half;
      const maxX = dir.x !== 0 ? Math.max(x0, x1) : p.wx + half;
      const minZ = dir.z !== 0 ? Math.min(z0, z1) : p.wz - half;
      const maxZ = dir.z !== 0 ? Math.max(z0, z1) : p.wz + half;
      this.addBox({ minX, maxX, minZ, maxZ, minY: p.wy, maxY: p.wy + ((i + 1) / steps) * FLOOR_H });
    }
  }

  /** Boxes possibly overlapping a circle of radius r around (x, z). */
  boxesNear(x: number, z: number, r: number, out: Box[] = []): Box[] {
    out.length = 0;
    const x0 = Math.floor((x - r) / CELL),
      x1 = Math.floor((x + r) / CELL);
    const z0 = Math.floor((z - r) / CELL),
      z1 = Math.floor((z + r) / CELL);
    const seen = new Set<Box>();
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (!this.inBounds(cx, cz)) continue;
        for (const b of this.cellBoxes[cz * this.width + cx]) {
          if (!seen.has(b)) {
            seen.add(b);
            out.push(b);
          }
        }
      }
    }
    return out;
  }

  /** True if the point is inside a solid. `openExits` bitmask skips opened exit doors. */
  pointSolid(x: number, y: number, z: number, openExits = 0, ignoreGlass = false): boolean {
    if (x < 0 || z < 0 || x >= this.width * CELL || z >= this.depth * CELL) return true;
    const cx = Math.floor(x / CELL),
      cz = Math.floor(z / CELL);
    for (const b of this.cellBoxes[cz * this.width + cx]) {
      if (b.exit !== undefined && openExits & (1 << b.exit)) continue;
      if (ignoreGlass && b.seeThrough) continue;
      if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ && y > b.minY && y < b.maxY) return true;
    }
    return false;
  }

  /** Line of sight between two points (glass does not block sight). */
  lineOfSight(ax: number, ay: number, az: number, bx: number, by: number, bz: number, openExits = 0): boolean {
    const dx = bx - ax,
      dy = by - ay,
      dz = bz - az;
    const dist = Math.hypot(dx, dy, dz);
    const steps = Math.max(1, Math.ceil(dist / 0.25));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.pointSolid(ax + dx * t, ay + dy * t, az + dz * t, openExits, true)) return false;
    }
    return true;
  }

  /** A walkable cell for tier-filtered random placement. */
  isReachableCell(f: number, x: number, z: number) {
    return this.inBounds(x, z) && (this.reachTier[f]?.[z * this.width + x] ?? 255) <= this.tier;
  }
}
