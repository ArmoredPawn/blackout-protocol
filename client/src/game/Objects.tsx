import { Billboard } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { CELL, DIRS, OBJECT_SOLIDS, parseAvatar, propCenter, yawForRot, type MapRuntime, type PlacedEntity } from "@bp/shared";
import { net } from "../net/connection";
import { useApp } from "../store";
import { AvatarModel, newPose } from "./Avatar3D";

const C = {
  idle: new THREE.Color("#3aa8ff"),
  hacked: new THREE.Color("#38ff9c"),
  alarm: new THREE.Color("#ff3048"),
  jam: new THREE.Color("#c45cff"),
};

/** Progress bar billboard; `xray` renders through walls. */
function Bar({ value, color, y, xray = false, width = 1.2 }: { value: number; color: string; y: number; xray?: boolean; width?: number }) {
  return (
    <Billboard position={[0, y, 0]}>
      <mesh renderOrder={xray ? 10 : 0}>
        <planeGeometry args={[width + 0.08, 0.2]} />
        <meshBasicMaterial color="#0b0f16" transparent opacity={0.75} depthTest={!xray} />
      </mesh>
      <mesh position={[(-width / 2) * (1 - value), 0, 0.001]} scale={[Math.max(0.001, value), 1, 1]} renderOrder={xray ? 11 : 0}>
        <planeGeometry args={[width, 0.12]} />
        <meshBasicMaterial color={color} toneMapped={false} depthTest={!xray} />
      </mesh>
    </Billboard>
  );
}

function Terminal({ e }: { e: PlacedEntity }) {
  const st = useApp((s) => s.snap?.terminals[e.id]);
  const screen = useRef<THREE.MeshBasicMaterial>(null!);
  const { cx, cz } = propCenter(e, OBJECT_SOLIDS.terminal.w, OBJECT_SOLIDS.terminal.d, 0.25);
  const rot = yawForRot(e.r) + Math.PI;
  useFrame(() => {
    const t = net.snap?.terminals[e.id];
    if (!t || !screen.current) return;
    const now = net.serverNow();
    const c = t.hacked ? C.hacked : t.jammedUntil > now ? C.jam : now - t.alarmAt < 1500 && Math.floor(now / 120) % 2 ? C.alarm : C.idle;
    screen.current.color.copy(c);
  });
  const revealed = performance.now() < net.terminalRevealUntil;
  const showBar = !!st && !st.hacked && (st.hackers > 0 || revealed || st.progress > 0);
  return (
    <group position={[cx, e.wy, cz]} rotation={[0, rot, 0]}>
      <mesh position={[0, 0.74, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.5, 0.06, 0.8]} />
        <meshStandardMaterial color="#3a4250" roughness={0.6} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.37, 0.1]} castShadow>
        <boxGeometry args={[1.35, 0.74, 0.5]} />
        <meshStandardMaterial color="#2a303a" roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.13, 0.15]} castShadow>
        <boxGeometry args={[0.95, 0.62, 0.08]} />
        <meshStandardMaterial color="#14181f" roughness={0.4} />
      </mesh>
      <mesh position={[0, 1.13, 0.105]}>
        <planeGeometry args={[0.85, 0.52]} />
        <meshBasicMaterial ref={screen} color="#3aa8ff" toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.79, -0.15]}>
        <boxGeometry args={[0.6, 0.03, 0.2]} />
        <meshStandardMaterial color="#1a1d22" />
      </mesh>
      {showBar && <Bar value={st!.progress} color={st!.jammedUntil > net.serverNow() ? "#c45cff" : "#3aa8ff"} y={1.85} xray={revealed} />}
      {st?.hacked && <pointLight position={[0, 1.2, -0.4]} color="#38ff9c" intensity={1.2} distance={4} />}
    </group>
  );
}

function Pod({ e }: { e: PlacedEntity }) {
  const st = useApp((s) => s.snap?.pods[e.id]);
  const occupant = useApp((s) => (st?.occupant ? s.snap?.players[st.occupant] : undefined));
  const glow = useRef<THREE.MeshStandardMaterial>(null!);
  useFrame(() => {
    if (!glow.current) return;
    const t = performance.now() / 1000;
    glow.current.emissiveIntensity = st?.occupant ? 1.2 + Math.sin(t * 6) * 0.6 : 0.5;
  });
  const left = occupant ? Math.max(0, (occupant.podEndsAt - net.serverNow()) / 1000) : 0;
  return (
    <group position={[e.wx, e.wy, e.wz]}>
      <mesh position={[0, 0.12, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.68, 0.75, 0.24, 20]} />
        <meshStandardMaterial color="#3a4250" metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0, 1.25, 0]} renderOrder={3}>
        <cylinderGeometry args={[0.6, 0.6, 2.0, 20, 1, true]} />
        <meshStandardMaterial
          ref={glow}
          color={st?.occupant ? "#ff8a9a" : "#9fe8ff"}
          emissive={st?.occupant ? "#ff2a3d" : "#2a9fd0"}
          emissiveIntensity={0.5}
          transparent
          opacity={0.35}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[0, 2.35, 0]} castShadow>
        <cylinderGeometry args={[0.7, 0.66, 0.24, 20]} />
        <meshStandardMaterial color="#3a4250" metalness={0.5} roughness={0.4} />
      </mesh>
      {occupant && <Bar value={Math.min(1, left / 60)} color="#ff4d5e" y={2.9} xray width={1.3} />}
      {occupant && st && st.rescue > 0 && <Bar value={st.rescue} color="#38ff9c" y={3.15} xray width={1.3} />}
    </group>
  );
}

function Exit({ e }: { e: PlacedEntity & { index: number } }) {
  const st = useApp((s) => s.snap?.exits[e.id]);
  const powered = useApp((s) => !!s.snap?.exitsPowered);
  const left = useRef<THREE.Group>(null!);
  const right = useRef<THREE.Group>(null!);
  const prog = useRef(0);
  const d = DIRS[e.r ?? 0];
  const along = d.x !== 0 ? "z" : "x";
  useFrame((_, dt) => {
    const target = st?.open ? 1 : (st?.progress ?? 0) * 0.15;
    prog.current += (target - prog.current) * Math.min(1, dt * 3);
    const off = prog.current * (CELL / 2 - 0.05);
    if (left.current && right.current) {
      left.current.position[along] = -CELL / 4 - off;
      right.current.position[along] = CELL / 4 + off;
    }
  });
  const color = st?.open ? "#38ff9c" : powered ? "#ffd84a" : "#ff3048";
  const panel: [number, number, number] = along === "x" ? [CELL / 2 - 0.02, 2.7, 0.25] : [0.25, 2.7, CELL / 2 - 0.02];
  return (
    <group position={[e.wx, e.wy, e.wz]}>
      <group ref={left}>
        <mesh position={[0, 1.35, 0]} scale={panel} castShadow>
          <boxGeometry />
          <meshStandardMaterial color="#59626e" metalness={0.6} roughness={0.35} />
        </mesh>
      </group>
      <group ref={right}>
        <mesh position={[0, 1.35, 0]} scale={panel} castShadow>
          <boxGeometry />
          <meshStandardMaterial color="#59626e" metalness={0.6} roughness={0.35} />
        </mesh>
      </group>
      {/* Frame + header */}
      <mesh position={[0, 3.2, 0]} scale={along === "x" ? [CELL, 1.1, 0.6] : [0.6, 1.1, CELL]}>
        <boxGeometry />
        <meshStandardMaterial color="#2c323b" />
      </mesh>
      <mesh position={[-d.x * 0.32, 2.85, -d.z * 0.32]} scale={along === "x" ? [CELL * 0.8, 0.12, 0.02] : [0.02, 0.12, CELL * 0.8]}>
        <boxGeometry />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      {/* Daylight beyond the exit */}
      <mesh position={[d.x * 1.2, 1.5, d.z * 1.2]} rotation={[0, yawForRot(e.r), 0]}>
        <planeGeometry args={[CELL, 3]} />
        <meshBasicMaterial color={st?.open ? "#eaffff" : "#20262e"} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      {st && !st.open && st.progress > 0 && (
        <group position={[-d.x * 1.5, 0, -d.z * 1.5]}>
          <Bar value={st.progress} color="#ffd84a" y={2.4} />
        </group>
      )}
      {(powered || st?.open) && <pointLight position={[-d.x * 1, 2.4, -d.z * 1]} color={color} intensity={4} distance={7} />}
    </group>
  );
}

function Pickups() {
  const pickups = useApp((s) => s.snap?.pickups);
  const group = useRef<THREE.Group>(null!);
  useFrame(({ clock }) => {
    group.current?.children.forEach((c, i) => {
      c.rotation.y = clock.elapsedTime * 1.6 + i;
      c.position.y = (c.userData.baseY ?? 0) + 0.9 + Math.sin(clock.elapsedTime * 2.4 + i) * 0.12;
    });
  });
  return (
    <group ref={group}>
      {Object.entries(pickups ?? {}).map(([id, p]) => (
        <mesh key={id} position={[p.x, p.y + 0.9, p.z]} userData={{ baseY: p.y }} rotation={[0.6, 0, 0.6]}>
          <boxGeometry args={[0.45, 0.45, 0.45]} />
          <meshStandardMaterial color="#ffe066" emissive="#ffb000" emissiveIntensity={1.4} metalness={0.3} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

function Traps() {
  const traps = useApp((s) => s.snap?.traps);
  const meRole = useApp((s) => (s.snap && s.myId ? s.snap.players[s.myId]?.role : undefined));
  return (
    <>
      {Object.entries(traps ?? {}).map(([id, t]) =>
        meRole === "hunter" || t.sprung ? (
          <group key={id} position={[t.x, t.y + 0.03, t.z]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.35, 0.5, 16]} />
              <meshBasicMaterial color={t.sprung ? "#ff3048" : "#d4a017"} transparent opacity={meRole === "hunter" && !t.sprung ? 0.55 : 1} />
            </mesh>
            {t.sprung && (
              <mesh position={[0, 0.2, 0]}>
                <torusGeometry args={[0.35, 0.06, 6, 12]} />
                <meshStandardMaterial color="#888" metalness={0.8} roughness={0.3} />
              </mesh>
            )}
          </group>
        ) : null,
      )}
    </>
  );
}

function Smoke({ x, y, z, radius }: { x: number; y: number; z: number; radius: number }) {
  const puffs = useMemo(
    () =>
      Array.from({ length: 14 }, () => ({
        p: [(Math.random() - 0.5) * radius * 1.4, Math.random() * 2.2 + 0.3, (Math.random() - 0.5) * radius * 1.4] as [number, number, number],
        s: radius * (0.35 + Math.random() * 0.35),
      })),
    [radius],
  );
  const g = useRef<THREE.Group>(null!);
  useFrame(({ clock }) => {
    if (g.current) g.current.rotation.y = clock.elapsedTime * 0.15;
  });
  return (
    <group ref={g} position={[x, y, z]}>
      {puffs.map((p, i) => (
        <mesh key={i} position={p.p} scale={p.s}>
          <icosahedronGeometry args={[1, 1]} />
          <meshStandardMaterial color="#c8ccd4" transparent opacity={0.55} depthWrite={false} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

function Decoy({ owner, x, y, z, ry }: { owner: string; x: number; y: number; z: number; ry: number }) {
  const avatarJson = useApp((s) => s.snap?.players[owner]?.avatar);
  const avatar = useMemo(() => parseAvatar(avatarJson ?? ""), [avatarJson]);
  const pose = useRef({ ...newPose(), mode: "run" as const, speed: 5.2 });
  const g = useRef<THREE.Group>(null!);
  useFrame((_, dt) => {
    if (!g.current) return;
    g.current.position.x += (x - g.current.position.x) * Math.min(1, dt * 8);
    g.current.position.z += (z - g.current.position.z) * Math.min(1, dt * 8);
    g.current.position.y = y;
    g.current.rotation.y = ry;
  });
  if (!avatar) return null;
  return (
    <group ref={g} position={[x, y, z]}>
      <AvatarModel avatar={avatar} pose={pose} />
    </group>
  );
}

function Zones() {
  const zones = useApp((s) => s.snap?.zones);
  return (
    <>
      {Object.entries(zones ?? {}).map(([id, zn]) =>
        zn.kind === "smoke" ? <Smoke key={id} x={zn.x} y={zn.y} z={zn.z} radius={zn.radius} /> : <Decoy key={id} owner={zn.owner} x={zn.x} y={zn.y} z={zn.z} ry={zn.ry} />,
      )}
    </>
  );
}

export function Objects({ rt }: { rt: MapRuntime }) {
  return (
    <group>
      {rt.terminals.map((t) => (
        <Terminal key={t.id} e={t} />
      ))}
      {rt.pods.map((p) => (
        <Pod key={p.id} e={p} />
      ))}
      {rt.exits.map((e) => (
        <Exit key={e.id} e={e} />
      ))}
      <Pickups />
      <Traps />
      <Zones />
    </group>
  );
}
