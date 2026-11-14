import { CELL, DIRS, OBJECT_SOLIDS, PROPS, STAIR_LENGTH, type MapDefinition } from "@bp/shared";
import { OBJECT_TOOLS } from "./model";

const TILE: Record<string, string> = {
  ".": "#3a4558",
  ",": "#4a5a76",
  ":": "#2c3442",
  "#": "#aab6cc",
  G: "#5aa8d8",
  W: "#7c88a0",
  D: "#3a4558",
  V: "#20262f",
  "1": "#d4a017",
  "2": "#d48a17",
  "3": "#d46a17",
};

export interface DrawOpts {
  floor: number;
  cs: number; // pixels per cell
  ox: number; // pan offset (px)
  oy: number;
  hover?: { x: number; z: number } | null;
  rect?: { x0: number; z0: number; x1: number; z1: number } | null;
  dpr: number;
}

export function drawEditor(ctx: CanvasRenderingContext2D, m: MapDefinition, o: DrawOpts) {
  const { cs, ox, oy, floor } = o;
  const W = ctx.canvas.width / o.dpr,
    H = ctx.canvas.height / o.dpr;
  ctx.setTransform(o.dpr, 0, 0, o.dpr, 0, 0);
  ctx.fillStyle = "#05070c";
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(ox, oy);

  // Void backdrop
  ctx.fillStyle = "#0b0f17";
  ctx.fillRect(0, 0, m.width * cs, m.depth * cs);

  const drawFloor = (f: number, alpha: number) => {
    ctx.globalAlpha = alpha;
    const rows = m.floors[f] ?? [];
    for (let z = 0; z < m.depth; z++) {
      const row = rows[z] ?? "";
      for (let x = 0; x < m.width; x++) {
        const ch = row[x] ?? " ";
        if (ch === " ") continue;
        if (f !== floor && floor > 0 && (m.floors[floor]?.[z]?.[x] ?? " ") !== " ") continue;
        ctx.fillStyle = TILE[ch] ?? "#ff00ff";
        ctx.fillRect(x * cs, z * cs, cs, cs);
        if (f !== floor) continue;
        if (ch === "D") {
          ctx.fillStyle = "#c08a50";
          ctx.fillRect(x * cs + cs * 0.15, z * cs + cs * 0.4, cs * 0.7, cs * 0.2);
        } else if (ch === "V") {
          ctx.strokeStyle = "#5a6472";
          ctx.lineWidth = 1;
          for (let i = 1; i < 4; i++) {
            ctx.beginPath();
            ctx.moveTo(x * cs + (i * cs) / 4, z * cs + 2);
            ctx.lineTo(x * cs + (i * cs) / 4, z * cs + cs - 2);
            ctx.stroke();
          }
        } else if ("123".includes(ch) && cs >= 12) {
          ctx.fillStyle = "#1b1b1b";
          ctx.font = `700 ${Math.round(cs * 0.6)}px Inter, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(ch === "1" ? "M" : ch === "2" ? "L" : "XL", x * cs + cs / 2, z * cs + cs / 2 + 1);
        } else if (ch === ":" && cs >= 10) {
          ctx.strokeStyle = "rgba(255,255,255,0.08)";
          ctx.strokeRect(x * cs + 2, z * cs + 2, cs - 4, cs - 4);
        }
      }
    }
    ctx.globalAlpha = 1;
  };
  if (floor > 0) drawFloor(floor - 1, 0.28);
  drawFloor(floor, 1);

  // Grid
  if (cs >= 9) {
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= m.width; x++) {
      ctx.moveTo(x * cs + 0.5, 0);
      ctx.lineTo(x * cs + 0.5, m.depth * cs);
    }
    for (let z = 0; z <= m.depth; z++) {
      ctx.moveTo(0, z * cs + 0.5);
      ctx.lineTo(m.width * cs, z * cs + 0.5);
    }
    ctx.stroke();
  }

  // Objects
  const px = (metres: number) => (metres / CELL) * cs;
  for (const e of m.entities) {
    if (e.f !== floor) continue;
    const cx = (e.x + 0.5) * cs,
      cz = (e.z + 0.5) * cs;
    const r = (e.r ?? 0) & 3;
    const d = DIRS[r];
    if (e.t === "prop" && e.k && PROPS[e.k]) {
      const p = PROPS[e.k];
      const back = (CELL / 2 - Math.min(p.w, p.d) / 2) * (p.back ?? 0);
      const bx = cx - d.x * px(back),
        bz = cz - d.z * px(back);
      const w = r % 2 ? px(p.d) : px(p.w),
        h = r % 2 ? px(p.w) : px(p.d);
      ctx.fillStyle = p.solid ? "rgba(200,160,110,0.85)" : "rgba(150,200,150,0.6)";
      ctx.fillRect(bx - w / 2, bz - h / 2, w, h);
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.strokeRect(bx - w / 2, bz - h / 2, w, h);
      // facing tick
      ctx.fillStyle = "#1b1b1b";
      ctx.fillRect(bx + d.x * (w / 2 - 2) - 1.5, bz + d.z * (h / 2 - 2) - 1.5, 3, 3);
      continue;
    }
    const tool = OBJECT_TOOLS.find((t) => t.t === e.t);
    const color = e.t === "light" && e.c ? e.c : (tool?.color ?? "#fff");
    if (e.t === "stairs") {
      ctx.fillStyle = "rgba(200,210,230,0.35)";
      const x0 = Math.min(e.x, e.x + d.x * (STAIR_LENGTH - 1)),
        z0 = Math.min(e.z, e.z + d.z * (STAIR_LENGTH - 1));
      const wc = d.x ? STAIR_LENGTH : 1,
        hc = d.z ? STAIR_LENGTH : 1;
      ctx.fillRect(x0 * cs + 2, z0 * cs + 2, wc * cs - 4, hc * cs - 4);
      arrow(ctx, cx, cz, cx + d.x * cs * (STAIR_LENGTH - 0.7), cz + d.z * cs * (STAIR_LENGTH - 0.7), "#e8eef9", Math.max(2, cs / 8));
      continue;
    }
    if (e.t === "terminal" || e.t === "pod") {
      const s = OBJECT_SOLIDS[e.t];
      const w = r % 2 ? px(s.d) : px(s.w),
        h = r % 2 ? px(s.w) : px(s.d);
      ctx.fillStyle = color;
      if (e.t === "pod") {
        ctx.beginPath();
        ctx.arc(cx, cz, Math.min(w, h) / 2, 0, Math.PI * 2);
        ctx.fill();
      } else ctx.fillRect(cx - w / 2, cz - h / 2, w, h);
    } else if (e.t === "exit") {
      ctx.fillStyle = color;
      ctx.fillRect(e.x * cs + 2, e.z * cs + 2, cs - 4, cs - 4);
      arrow(ctx, cx - d.x * cs * 0.3, cz - d.z * cs * 0.3, cx + d.x * cs * 0.9, cz + d.z * cs * 0.9, "#1b1b1b", Math.max(2, cs / 8));
      continue;
    } else {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cz, cs * 0.32, 0, Math.PI * 2);
      ctx.fill();
    }
    if (cs >= 12) {
      ctx.fillStyle = "#0b0f17";
      ctx.font = `800 ${Math.round(cs * 0.45)}px Inter, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(tool?.glyph ?? "?", cx, cz + 1);
    }
  }

  // Hover + rectangle preview
  if (o.rect) {
    const { x0, z0, x1, z1 } = o.rect;
    ctx.strokeStyle = "#3cffd2";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(Math.min(x0, x1) * cs, Math.min(z0, z1) * cs, (Math.abs(x1 - x0) + 1) * cs, (Math.abs(z1 - z0) + 1) * cs);
    ctx.setLineDash([]);
    ctx.fillStyle = "#3cffd2";
    ctx.font = "600 12px Inter, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`${Math.abs(x1 - x0) + 1} × ${Math.abs(z1 - z0) + 1}`, Math.min(x0, x1) * cs + 4, Math.min(z0, z1) * cs - 6);
  } else if (o.hover) {
    ctx.strokeStyle = "#3cffd2";
    ctx.lineWidth = 2;
    ctx.strokeRect(o.hover.x * cs + 1, o.hover.z * cs + 1, cs - 2, cs - 2);
  }
  ctx.restore();
}

function arrow(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, w: number) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  ctx.strokeStyle = ctx.fillStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  const s = w * 3;
  ctx.beginPath();
  ctx.moveTo(x1 + Math.cos(a) * s * 0.4, y1 + Math.sin(a) * s * 0.4);
  ctx.lineTo(x1 - Math.cos(a - 0.5) * s, y1 - Math.sin(a - 0.5) * s);
  ctx.lineTo(x1 - Math.cos(a + 0.5) * s, y1 - Math.sin(a + 0.5) * s);
  ctx.fill();
}
