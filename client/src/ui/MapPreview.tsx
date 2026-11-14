import { useEffect, useRef } from "react";
import { MapRuntime, Tile, type MapDefinition } from "@bp/shared";

const TILE_COLORS: Partial<Record<Tile, string>> = {
  [Tile.Floor]: "#3a4558",
  [Tile.FloorAlt]: "#46536a",
  [Tile.FloorGrate]: "#2c3442",
  [Tile.Wall]: "#9aa7bd",
  [Tile.Glass]: "#5aa8d8",
  [Tile.Low]: "#6c7890",
  [Tile.Door]: "#3a4558",
  [Tile.Vent]: "#2a3140",
  [Tile.GateClosed]: "#d4a017",
  [Tile.GateOpen]: "#3a4558",
};

export interface MarkerOverlay {
  x: number; // world
  z: number;
  color: string;
  r?: number;
}

/**
 * Top-down render of a map at a tier (each floor side by side). Used for the
 * lobby map picker and the in-game map.
 */
export function drawMap(
  canvas: HTMLCanvasElement,
  rt: MapRuntime,
  opts: { floor?: number; markers?: MarkerOverlay[]; terminalState?: Record<string, { hacked: boolean }> } = {},
) {
  const floors = opts.floor !== undefined ? [opts.floor] : Array.from({ length: rt.floorCount }, (_, i) => i);
  const gap = 2;
  const cellsW = rt.width * floors.length + gap * (floors.length - 1);
  const scale = Math.max(2, Math.floor(Math.min(1200 / cellsW, 900 / rt.depth)));
  canvas.width = cellsW * scale;
  canvas.height = rt.depth * scale;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#05070c";
  g.fillRect(0, 0, canvas.width, canvas.height);
  floors.forEach((f, i) => {
    const ox = i * (rt.width + gap) * scale;
    for (let z = 0; z < rt.depth; z++)
      for (let x = 0; x < rt.width; x++) {
        const t = rt.tileAt(f, x, z);
        const c = TILE_COLORS[t];
        if (!c) continue;
        const reach = rt.isReachableCell(f, x, z) || t === Tile.Wall || t === Tile.Glass || t === Tile.GateClosed;
        g.globalAlpha = reach ? 1 : 0.25;
        g.fillStyle = c;
        g.fillRect(ox + x * scale, z * scale, scale, scale);
      }
    g.globalAlpha = 1;
    const dot = (e: { f: number; x: number; z: number }, color: string, size = 0.8) => {
      if (e.f !== f) return;
      g.fillStyle = color;
      const s = scale * size;
      g.fillRect(ox + e.x * scale + (scale - s) / 2, e.z * scale + (scale - s) / 2, s, s);
    };
    for (const t of rt.terminals) dot(t, opts.terminalState?.[t.id]?.hacked ? "#38ff9c" : "#3aa8ff", 1);
    for (const p of rt.pods) dot(p, "#ff4d5e", 0.9);
    for (const e of rt.exits) dot(e, "#ffd84a", 1.2);
    for (const s of rt.stairs) dot(s, "#c8d2e6", 0.6);
    for (const m of opts.markers ?? []) {
      g.fillStyle = m.color;
      g.beginPath();
      g.arc(ox + (m.x / 2) * scale, (m.z / 2) * scale, (m.r ?? 0.8) * scale, 0, Math.PI * 2);
      g.fill();
    }
    if (floors.length > 1) {
      g.fillStyle = "#8a97ad";
      g.font = `${Math.max(10, scale * 2)}px Inter, sans-serif`;
      g.fillText(f === 0 ? "Ground" : `Floor ${f + 1}`, ox + 4, Math.max(12, scale * 2.2));
    }
  });
}

export function MapThumb({ def, tier }: { def: MapDefinition; tier: number }) {
  const ref = useRef<HTMLCanvasElement>(null!);
  useEffect(() => {
    try {
      drawMap(ref.current, new MapRuntime(def, tier));
    } catch {
      /* invalid map */
    }
  }, [def, tier]);
  return <canvas ref={ref} />;
}
