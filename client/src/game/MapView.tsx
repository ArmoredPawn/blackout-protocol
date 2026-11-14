import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { CELL, type MapRuntime } from "@bp/shared";
import type { Bucket, MapBuild } from "./mapGeometry";
import { floorTexture, genericTexture, grateTexture, hazardTexture, wallTexture } from "./textures";
import { useApp } from "../store";
import { game } from "./state";

function useMaterials(build: MapBuild) {
  return useMemo(() => {
    const pal = build.palette;
    const std = (map: THREE.Texture | null, rough: number, metal = 0, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
      new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: rough, metalness: metal, ...extra });
    const m: Record<Bucket, THREE.Material> = {
      floor: std(floorTexture(pal.floorPattern), 0.75),
      floorAlt: std(floorTexture(pal.floorAltPattern), 0.8),
      grate: std(grateTexture(), 0.5, 0.6),
      wall: std(wallTexture(pal.wallPattern), 0.9),
      ceiling: std(genericTexture(), 0.95),
      hazard: std(hazardTexture(), 0.6, 0.2),
      paint: std(genericTexture(), 0.7),
      wood: std(genericTexture(), 0.8),
      metal: std(genericTexture(), 0.45, 0.55),
      fabric: std(genericTexture(), 1),
      dark: std(null, 0.6, 0.3),
      glass: new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.2, depthWrite: false }),
      screen: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
      lamp: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    };
    (m.ceiling as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    return m;
  }, [build]);
}

export function MapView({ rt, build }: { rt: MapRuntime; build: MapBuild }) {
  const mats = useMaterials(build);
  const quality = useApp((s) => s.prefs.quality);
  const shadows = quality !== "low";
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  const W = rt.width * CELL,
    D = rt.depth * CELL;
  return (
    <group>
      {(Object.keys(build.geos) as Bucket[]).map((k) => (
        <mesh
          key={k}
          geometry={build.geos[k]!}
          material={mats[k]}
          castShadow={shadows && k !== "ceiling" && k !== "floor" && k !== "floorAlt" && k !== "glass" && k !== "lamp"}
          receiveShadow={shadows && k !== "lamp" && k !== "screen"}
          renderOrder={k === "glass" ? 2 : 0}
        />
      ))}
      {/* Exterior ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[W / 2, -0.14, D / 2]} receiveShadow>
        <planeGeometry args={[W + 200, D + 200]} />
        <meshStandardMaterial color={build.palette.outside} roughness={1} />
      </mesh>
      <LightPool build={build} />
    </group>
  );
}

/** Only the K nearest fixtures get real point lights (cheap on integrated GPUs). */
function LightPool({ build }: { build: MapBuild }) {
  const quality = useApp((s) => s.prefs.quality);
  const K = quality === "high" ? 8 : quality === "medium" ? 5 : 3;
  const refs = useRef<(THREE.PointLight | null)[]>([]);
  const camera = useThree((s) => s.camera);
  const lampIntensity = (game.rt?.def.lighting.lamp ?? 1.2) * 9;
  const tmp = useMemo(() => new THREE.Color(), []);
  const frame = useRef(0);
  useFrame(() => {
    if (frame.current++ % 6 !== 0) return; // re-evaluate ~10× per second
    const cx = camera.position.x,
      cy = camera.position.y,
      cz = camera.position.z;
    const sorted = build.lamps
      .map((l) => ({ l, d: (l.x - cx) ** 2 + (l.y - cy) ** 2 * 4 + (l.z - cz) ** 2 }))
      .sort((a, b) => a.d - b.d)
      .slice(0, K);
    refs.current.forEach((pl, i) => {
      if (!pl) return;
      const s = sorted[i];
      if (!s) {
        pl.intensity = 0;
        return;
      }
      pl.position.set(s.l.x, s.l.y, s.l.z);
      pl.color.copy(tmp.set(s.l.color));
      pl.intensity = lampIntensity;
    });
  });
  return (
    <>
      {Array.from({ length: K }, (_, i) => (
        <pointLight key={i} ref={(r) => void (refs.current[i] = r)} distance={14} decay={1.6} intensity={0} />
      ))}
    </>
  );
}
