import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { CELL, MapRuntime, type MapDefinition } from "@bp/shared";
import { buildMapGeometry } from "../game/mapGeometry";
import { MapView } from "../game/MapView";
import { Objects } from "../game/Objects";
import { game } from "../game/state";

function Scene({ rt }: { rt: MapRuntime }) {
  const build = useMemo(() => buildMapGeometry(rt), [rt]);
  const scene = useThree((s) => s.scene);
  const L = rt.def.lighting;
  useEffect(() => {
    game.rt = rt; // MapView reads lamp brightness from here
    scene.background = new THREE.Color(L.sky);
    scene.fog = new THREE.FogExp2(L.fog, L.fogDensity * 0.5);
    return () => {
      scene.fog = null;
      for (const g of Object.values(build.geos)) g?.dispose();
    };
  }, [rt, build, scene, L.sky, L.fog, L.fogDensity]);
  const cx = (rt.width * CELL) / 2,
    cz = (rt.depth * CELL) / 2;
  return (
    <>
      <ambientLight color={L.ambient} intensity={L.ambientIntensity + 0.25} />
      <hemisphereLight color={L.ambient} groundColor="#1a1410" intensity={0.5} />
      <directionalLight position={[cx + 20, 60, cz + 10]} intensity={0.6} />
      <MapView rt={rt} build={build} hideCeiling />
      <Objects rt={rt} />
      <OrbitControls target={[cx, 0, cz]} maxPolarAngle={Math.PI / 2.05} minDistance={3} maxDistance={Math.max(rt.width, rt.depth) * CELL * 1.6} makeDefault />
    </>
  );
}

/** Orbit preview of the map being edited (ceilings hidden from above via near-plane cut). */
export function Preview3D({ map, tier }: { map: MapDefinition; tier: number }) {
  const rt = useMemo(() => {
    try {
      return new MapRuntime(map, tier);
    } catch {
      return null;
    }
  }, [map, tier]);
  if (!rt) return <div className="muted" style={{ padding: 20 }}>This map can&apos;t be previewed yet.</div>;
  const span = Math.max(rt.width, rt.depth) * CELL;
  return (
    <Canvas dpr={[1, 1.5]} camera={{ fov: 50, near: 0.5, far: 600, position: [(rt.width * CELL) / 2, span * 0.75, rt.depth * CELL + span * 0.25] }}>
      <Scene rt={rt} />
    </Canvas>
  );
}
