import * as THREE from "three";
import {
  CELL,
  DIRS,
  FLOOR_H,
  LINTEL_Y,
  LOW_WALL_H,
  PROPS,
  STAIR_LENGTH,
  Tile,
  VENT_CLEARANCE,
  cellCenter,
  isWalkableTile,
  propCenter,
  type MapRuntime,
} from "@bp/shared";
import { RECIPES, resolveColor, type Mat } from "./propRecipes";
import { THEMES, type ThemePalette } from "./themes";

export type Bucket = "floor" | "floorAlt" | "grate" | "wall" | "ceiling" | "hazard" | Mat;

/** Accumulates indexed box geometry with world-space UVs and vertex colours. */
class GeoBuilder {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  private c = new THREE.Color();

  box(cx: number, y0: number, cz: number, sx: number, sy: number, sz: number, color: string, uvY = FLOOR_H, jitter = 0) {
    const x0 = cx - sx / 2,
      x1 = cx + sx / 2,
      z0 = cz - sz / 2,
      z1 = cz + sz / 2,
      y1 = y0 + sy;
    this.c.set(color);
    if (jitter) this.c.offsetHSL(0, 0, (Math.random() - 0.5) * jitter);
    const r = this.c.r,
      g = this.c.g,
      b = this.c.b;
    const face = (
      ax: number, ay: number, az: number,
      bx: number, by: number, bz: number,
      cx2: number, cy: number, cz2: number,
      dx: number, dy: number, dz: number,
      nx: number, ny: number, nz: number,
      mode: "xz" | "xy" | "zy",
    ) => {
      const base = this.pos.length / 3;
      const pts = [
        [ax, ay, az],
        [bx, by, bz],
        [cx2, cy, cz2],
        [dx, dy, dz],
      ];
      for (const [px, py, pz] of pts) {
        this.pos.push(px, py, pz);
        this.nor.push(nx, ny, nz);
        this.col.push(r, g, b);
        if (mode === "xz") this.uv.push(px / CELL, pz / CELL);
        else if (mode === "xy") this.uv.push(px / CELL, py / uvY);
        else this.uv.push(pz / CELL, py / uvY);
      }
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    // +Y, -Y, +X, -X, +Z, -Z (counter-clockwise from outside)
    face(x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0, 0, 1, 0, "xz");
    face(x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1, 0, -1, 0, "xz");
    face(x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1, 1, 0, 0, "zy");
    face(x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0, -1, 0, 0, "zy");
    face(x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1, 0, 0, 1, "xy");
    face(x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0, 0, 0, -1, "xy");
  }

  build(): THREE.BufferGeometry | null {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx.length > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}

export interface MapBuild {
  geos: Partial<Record<Bucket, THREE.BufferGeometry>>;
  /** Ceiling height per floor/cell (world y) – used to keep the camera indoors. */
  ceiling: Float32Array[];
  palette: ThemePalette;
  lamps: { x: number; y: number; z: number; color: string }[];
}

const isSolidTile = (t: Tile) => t === Tile.Wall || t === Tile.GateClosed || t === Tile.Glass;

export function buildMapGeometry(rt: MapRuntime): MapBuild {
  const pal = THEMES[rt.def.theme] ?? THEMES.facility;
  const B = new Map<Bucket, GeoBuilder>();
  const b = (k: Bucket) => {
    let g = B.get(k);
    if (!g) B.set(k, (g = new GeoBuilder()));
    return g;
  };
  const W = rt.width,
    D = rt.depth,
    F = rt.floorCount;
  const exitCells = new Set(rt.exits.map((e) => `${e.f},${e.x},${e.z}`));
  const stairUpper = new Set<string>();
  for (const s of rt.stairs) {
    const d = DIRS[s.r ?? 0];
    for (let i = 0; i < STAIR_LENGTH; i++) stairUpper.add(`${s.f + 1},${s.x + d.x * i},${s.z + d.z * i}`);
  }

  // Ceiling heights.
  const ceiling: Float32Array[] = [];
  for (let f = 0; f < F; f++) {
    const arr = new Float32Array(W * D);
    for (let z = 0; z < D; z++)
      for (let x = 0; x < W; x++) {
        let g = f + 1;
        while (g < F && rt.tileAt(g, x, z) === Tile.Void) g++;
        arr[z * W + x] = g * FLOOR_H - 0.3;
      }
    ceiling.push(arr);
  }

  for (let f = 0; f < F; f++) {
    const base = f * FLOOR_H;
    const top = base + FLOOR_H - 0.25;
    for (let z = 0; z < D; z++) {
      for (let x = 0; x < W; x++) {
        const t = rt.tileAt(f, x, z);
        if (t === Tile.Void) continue;
        const cx = cellCenter(x),
          cz = cellCenter(z);
        // Wall orientation (for door frames / glass): does the wall line run along X?
        const runsX = isSolidTile(rt.tileAt(f, x - 1, z)) || isSolidTile(rt.tileAt(f, x + 1, z));

        if (isWalkableTile(t) || t === Tile.Low) {
          const fb: Bucket = t === Tile.FloorAlt ? "floorAlt" : t === Tile.FloorGrate || t === Tile.Vent ? "grate" : "floor";
          const fc = fb === "floorAlt" ? pal.floorAlt : fb === "grate" ? pal.grate : pal.floor;
          b(fb).box(cx, base - 0.12, cz, CELL, 0.12, CELL, fc, FLOOR_H, 0.04);
          const ch = ceiling[f][z * W + x];
          b("ceiling").box(cx, ch, cz, CELL, 0.1, CELL, pal.ceiling, FLOOR_H);
        }

        switch (t) {
          case Tile.Wall: {
            if (exitCells.has(`${f},${x},${z}`)) break;
            b("wall").box(cx, base, cz, CELL, FLOOR_H - 0.25, CELL, pal.wall);
            b("paint").box(cx, base + 1.05, cz, CELL + 0.04, 0.1, CELL + 0.04, pal.wallBand);
            b("paint").box(cx, base, cz, CELL + 0.03, 0.12, CELL + 0.03, pal.trim);
            break;
          }
          case Tile.GateClosed:
            b("hazard").box(cx, base, cz, CELL, top - base, CELL, "#ffffff");
            b("paint").box(cx, top - 0.4, cz, CELL + 0.06, 0.4, CELL + 0.06, pal.trim);
            break;
          case Tile.Glass:
            b("paint").box(cx, base, cz, CELL, 0.5, CELL, pal.trim);
            b("glass").box(cx, base + 0.5, cz, runsX ? CELL : 0.12, top - base - 0.8, runsX ? 0.12 : CELL, "#a8d8ff");
            b("paint").box(cx, top - 0.3, cz, CELL, 0.3, CELL, pal.trim);
            break;
          case Tile.Low:
            b("paint").box(cx, base, cz, CELL, LOW_WALL_H - 0.08, CELL, pal.wall);
            b("paint").box(cx, base + LOW_WALL_H - 0.08, cz, CELL + 0.06, 0.08, CELL + 0.06, pal.trim);
            break;
          case Tile.Door:
          case Tile.GateOpen: {
            b("wall").box(cx, base + LINTEL_Y, cz, CELL, top - base - LINTEL_Y, CELL, pal.wall);
            const post = 0.14;
            if (runsX) {
              b("paint").box(cx - CELL / 2 + post / 2, base, cz, post, LINTEL_Y, CELL, pal.trim);
              b("paint").box(cx + CELL / 2 - post / 2, base, cz, post, LINTEL_Y, CELL, pal.trim);
            } else {
              b("paint").box(cx, base, cz - CELL / 2 + post / 2, CELL, LINTEL_Y, post, pal.trim);
              b("paint").box(cx, base, cz + CELL / 2 - post / 2, CELL, LINTEL_Y, post, pal.trim);
            }
            b("paint").box(cx, base + LINTEL_Y - 0.08, cz, CELL, 0.08, CELL, pal.trim);
            if (t === Tile.GateOpen) b("hazard").box(cx, base + LINTEL_Y - 0.25, cz, runsX ? CELL : 0.3, 0.25, runsX ? 0.3 : CELL, "#ffffff");
            break;
          }
          case Tile.Vent:
            b("metal").box(cx, base + VENT_CLEARANCE, cz, CELL, top - base - VENT_CLEARANCE, CELL, pal.metal);
            b("dark").box(cx, base + VENT_CLEARANCE - 0.05, cz, CELL, 0.05, CELL, "#222222");
            break;
        }
      }
    }
  }

  // Stairs: 8 steps + side stringers.
  for (const s of rt.stairs) {
    const d = DIRS[s.r ?? 0];
    const len = STAIR_LENGTH * CELL;
    const steps = 8;
    for (let i = 0; i < steps; i++) {
      const a = ((i + 0.5) / steps) * len - CELL / 2;
      const h = ((i + 1) / steps) * FLOOR_H;
      const cx = s.wx + d.x * a,
        cz = s.wz + d.z * a;
      const sx = d.x !== 0 ? len / steps : CELL - 0.2;
      const sz = d.z !== 0 ? len / steps : CELL - 0.2;
      b("paint").box(cx, s.wy, cz, sx, h, sz, i % 2 ? pal.floor : pal.floorAlt);
      b("paint").box(cx, s.wy + h - 0.05, cz, sx + (d.x ? 0 : 0.02), 0.05, sz + (d.z ? 0 : 0.02), pal.trim);
    }
    // Railings on both sides.
    const mid = len / 2 - CELL / 2;
    const rx = s.wx + d.x * mid,
      rz = s.wz + d.z * mid;
    const off = CELL / 2 - 0.06;
    for (const sign of [-1, 1]) {
      const ox = d.z !== 0 ? sign * off : 0,
        oz = d.x !== 0 ? sign * off : 0;
      b("metal").box(rx + ox, s.wy + FLOOR_H * 0.5, rz + oz, d.x ? len : 0.08, 0.08, d.z ? len : 0.08, pal.metal);
    }
  }

  // Props.
  for (const p of rt.props) {
    const recipe = p.k ? RECIPES[p.k] : undefined;
    const def = p.k ? PROPS[p.k] : undefined;
    if (!recipe || !def) continue;
    const { cx, cz } = propCenter(p, def.w, def.d, def.back ?? 0);
    const r = (p.r ?? 0) & 3;
    for (const [lx, ly, lz, w, h, dd, mat, color] of recipe) {
      // Rotate local (front = −z) into world for rotation r.
      let wx = lx,
        wz = lz,
        sw = w,
        sd = dd;
      if (r === 1) {
        wx = -lz;
        wz = lx;
        sw = dd;
        sd = w;
      } else if (r === 2) {
        wx = -lx;
        wz = -lz;
      } else if (r === 3) {
        wx = lz;
        wz = -lx;
        sw = dd;
        sd = w;
      }
      b(mat).box(cx + wx, p.wy + ly, cz + wz, sw, h, sd, resolveColor(color, pal), 1);
    }
  }

  // Light fixtures.
  const lamps: MapBuild["lamps"] = [];
  for (const l of rt.lights) {
    const ch = ceiling[l.f]?.[l.z * W + l.x] ?? l.wy + FLOOR_H - 0.3;
    const color = l.c ?? pal.lamp;
    b("lamp").box(l.wx, ch - 0.06, l.wz, 1.2, 0.06, 0.35, color);
    b("metal").box(l.wx, ch - 0.02, l.wz, 1.3, 0.02, 0.45, pal.trim);
    lamps.push({ x: l.wx, y: ch - 0.3, z: l.wz, color });
  }

  const geos: MapBuild["geos"] = {};
  for (const [k, g] of B) {
    const geo = g.build();
    if (geo) geos[k] = geo;
  }
  void stairUpper;
  return { geos, ceiling, palette: pal, lamps };
}

/** Camera helper: ceiling height at a world position for the storey containing y. */
export function ceilingAt(build: MapBuild, rt: MapRuntime, x: number, y: number, z: number) {
  const cx = Math.floor(x / CELL),
    cz = Math.floor(z / CELL);
  if (!rt.inBounds(cx, cz)) return Infinity;
  const f = Math.max(0, Math.min(rt.floorCount - 1, Math.floor((y + 0.5) / FLOOR_H)));
  return build.ceiling[f][cz * rt.width + cx] - 0.15;
}
