import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { Avatar } from "@bp/shared";
import { AvatarModel, newPose, type Pose, type PoseMode } from "../game/Avatar3D";

function Spinner({ avatar, mode, hunter }: { avatar: Avatar; mode: PoseMode; hunter: boolean }) {
  const g = useRef<THREE.Group>(null!);
  const pose = useRef<Pose>(newPose());
  pose.current.mode = mode;
  pose.current.speed = mode === "run" ? 5 : mode === "walk" ? 2.5 : 0;
  pose.current.hunter = hunter;
  useFrame((_, dt) => {
    if (g.current && mode === "idle") g.current.rotation.y += dt * 0.35;
  });
  return (
    <group ref={g} position={[0, -0.95, 0]}>
      <AvatarModel avatar={avatar} pose={pose} />
    </group>
  );
}

/** Rotatable 3D preview of an avatar (drag to rotate, scroll/pinch to zoom). */
export function AvatarPreview({ avatar, mode = "idle", hunter = false }: { avatar: Avatar; mode?: PoseMode; hunter?: boolean }) {
  return (
    <Canvas camera={{ position: [0, 0.4, 3.6], fov: 40 }} dpr={[1, 1.75]} shadows>
      <color attach="background" args={["#0a0e17"]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 4, 3]} intensity={1.6} castShadow />
      <directionalLight position={[-3, 2, -2]} intensity={0.6} color="#3cffd2" />
      <Spinner avatar={avatar} mode={mode} hunter={hunter} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.95, 0]} receiveShadow>
        <circleGeometry args={[1.3, 40]} />
        <meshStandardMaterial color="#141b29" />
      </mesh>
      <OrbitControls enablePan={false} minDistance={2} maxDistance={6} target={[0, 0.1, 0]} />
    </Canvas>
  );
}
