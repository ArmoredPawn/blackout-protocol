import { useEffect, useState } from "react";
import { getBuiltinMap, MapRuntime, type BodyState, type MapDefinition } from "@bp/shared";
import { net } from "../net/connection";
import { useApp } from "../store";
import { buildMapGeometry, type MapBuild } from "./mapGeometry";
import { newPose } from "./Avatar3D";

/** Mutable per-frame game state (kept out of React for performance). */
export const game = {
  rt: null as MapRuntime | null,
  build: null as MapBuild | null,
  key: "",
  body: { x: 0, y: 0, z: 0, vy: 0, grounded: true, crawling: false } as BodyState,
  ry: 0,
  yaw: 0,
  pitch: 0.22,
  dist: 7.5,
  seq: 1,
  lastSendAt: 0,
  lastCorr: -1,
  lastRound: -1,
  stepDist: 0,
  pose: newPose(),
  spectateIdx: 0,
  /** Camera shake intensity (decays). */
  shake: 0,
  firstPerson: false,
};

export function mapDefFor(mapId: string): MapDefinition | null {
  if (mapId === "custom") return net.customMap;
  return getBuiltinMap(mapId) ?? null;
}

/** Re-builds the client map when the server's map, tier, round or custom map changes. */
export function useMapRuntime(): { rt: MapRuntime; build: MapBuild } | null {
  const key = useApp((s) => (s.snap ? `${s.snap.mapId}|${s.snap.mapTier}|${s.snap.mapRev}|${s.snap.round}` : ""));
  const [, force] = useState(0);
  useEffect(() => {
    if (!key) return;
    const [mapId, tierStr] = key.split("|");
    const fullKey = `${key}|${net.customMapRev}`;
    if (game.key === fullKey) return;
    const def = mapDefFor(mapId);
    if (!def) {
      // Custom map not received yet – retry shortly.
      const t = setTimeout(() => force((n) => n + 1), 300);
      return () => clearTimeout(t);
    }
    const rt = new MapRuntime(def, Number(tierStr));
    const build = buildMapGeometry(rt);
    if (game.build) for (const g of Object.values(game.build.geos)) g?.dispose();
    game.rt = rt;
    game.build = build;
    game.key = fullKey;
    force((n) => n + 1);
  }, [key]);
  return game.rt && game.build && game.key.startsWith(key) && key ? { rt: game.rt, build: game.build } : null;
}

/** Bitmask of open exits in runtime order. */
export function openExitMask(): number {
  const rt = game.rt;
  const snap = net.snap;
  if (!rt || !snap) return 0;
  let m = 0;
  for (const e of rt.exits) if (snap.exits[e.id]?.open) m |= 1 << e.index;
  return m;
}
