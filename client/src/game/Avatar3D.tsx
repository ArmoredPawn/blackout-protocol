import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import type { Avatar } from "@bp/shared";
import { faceTexture } from "./textures";

export type PoseMode = "idle" | "walk" | "run" | "jump" | "crawl" | "hack" | "downed" | "carried" | "podded" | "carry" | "interact" | "spectate";

export interface Pose {
  mode: PoseMode;
  speed: number; // horizontal m/s, drives gait
  swingAt: number; // performance.now() of last swing
  hunter: boolean;
  struggle: number;
}

export const newPose = (): Pose => ({ mode: "idle", speed: 0, swingAt: -1e9, hunter: false, struggle: 0 });

const matCache = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: string, opts: { emissive?: string; rough?: number } = {}) {
  const key = `${color}|${opts.emissive ?? ""}|${opts.rough ?? 0.8}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.8, metalness: 0.05 });
    if (opts.emissive) {
      m.emissive = new THREE.Color(opts.emissive);
      m.emissiveIntensity = 1.6;
    }
    matCache.set(key, m);
  }
  return m;
}

const BOX = new THREE.BoxGeometry(1, 1, 1);
const ROUND_HEAD = new THREE.CylinderGeometry(0.5, 0.5, 1, 18);

function Block({ p, s, c, emissive, geo = BOX, rot }: { p: [number, number, number]; s: [number, number, number]; c: string; emissive?: string; geo?: THREE.BufferGeometry; rot?: [number, number, number] }) {
  return <mesh geometry={geo} material={mat(c, { emissive })} position={p} scale={s} rotation={rot} castShadow />;
}

function Hair({ a }: { a: Avatar }) {
  const c = a.colors.hair;
  switch (a.hair) {
    case "buzz":
      return <Block p={[0, 0.24, -0.01]} s={[0.5, 0.06, 0.5]} c={c} />;
    case "spiky":
      return (
        <group>
          <Block p={[0, 0.25, -0.02]} s={[0.52, 0.08, 0.52]} c={c} />
          {[-0.16, 0, 0.16].map((x, i) => (
            <Block key={i} p={[x, 0.33, -0.04 + (i % 2) * 0.06]} s={[0.12, 0.16, 0.12]} c={c} rot={[0.2, 0, x]} />
          ))}
        </group>
      );
    case "bob":
      return (
        <group>
          <Block p={[0, 0.22, -0.03]} s={[0.54, 0.12, 0.54]} c={c} />
          <Block p={[-0.25, 0.02, -0.03]} s={[0.06, 0.38, 0.5]} c={c} />
          <Block p={[0.25, 0.02, -0.03]} s={[0.06, 0.38, 0.5]} c={c} />
          <Block p={[0, 0.02, -0.27]} s={[0.52, 0.38, 0.06]} c={c} />
        </group>
      );
    case "long":
      return (
        <group>
          <Block p={[0, 0.22, -0.03]} s={[0.54, 0.12, 0.54]} c={c} />
          <Block p={[0, -0.15, -0.27]} s={[0.52, 0.75, 0.08]} c={c} />
          <Block p={[-0.26, -0.05, -0.05]} s={[0.06, 0.55, 0.45]} c={c} />
          <Block p={[0.26, -0.05, -0.05]} s={[0.06, 0.55, 0.45]} c={c} />
        </group>
      );
    case "ponytail":
      return (
        <group>
          <Block p={[0, 0.22, -0.03]} s={[0.53, 0.1, 0.53]} c={c} />
          <Block p={[0, 0.1, -0.33]} s={[0.14, 0.14, 0.14]} c={c} />
          <Block p={[0, -0.12, -0.37]} s={[0.12, 0.35, 0.1]} c={c} />
        </group>
      );
    case "mohawk":
      return <Block p={[0, 0.34, -0.02]} s={[0.1, 0.22, 0.5]} c={c} />;
    case "afro":
      return <Block p={[0, 0.25, -0.03]} s={[0.7, 0.42, 0.66]} c={c} geo={ROUND_HEAD} />;
    case "swoop":
      return (
        <group>
          <Block p={[0, 0.24, -0.02]} s={[0.52, 0.1, 0.52]} c={c} />
          <Block p={[0.08, 0.2, 0.22]} s={[0.4, 0.14, 0.12]} c={c} rot={[0, 0, -0.25]} />
        </group>
      );
    case "buns":
      return (
        <group>
          <Block p={[0, 0.23, -0.02]} s={[0.52, 0.08, 0.52]} c={c} />
          <Block p={[-0.2, 0.33, -0.05]} s={[0.16, 0.16, 0.16]} c={c} />
          <Block p={[0.2, 0.33, -0.05]} s={[0.16, 0.16, 0.16]} c={c} />
        </group>
      );
    default:
      return null;
  }
}

function Accessory({ a }: { a: Avatar }) {
  const c = a.colors.accessory;
  switch (a.accessory) {
    case "glasses":
      return (
        <group position={[0, 0.03, 0.255]}>
          <Block p={[-0.11, 0, 0]} s={[0.15, 0.1, 0.02]} c={c} />
          <Block p={[0.11, 0, 0]} s={[0.15, 0.1, 0.02]} c={c} />
          <Block p={[0, 0.02, 0]} s={[0.08, 0.02, 0.02]} c={c} />
        </group>
      );
    case "shades":
      return <Block p={[0, 0.03, 0.26]} s={[0.46, 0.1, 0.03]} c="#111111" />;
    case "headphones":
      return (
        <group>
          <Block p={[0, 0.28, 0]} s={[0.56, 0.05, 0.08]} c={c} />
          <Block p={[-0.27, 0.02, 0]} s={[0.07, 0.18, 0.16]} c={c} />
          <Block p={[0.27, 0.02, 0]} s={[0.07, 0.18, 0.16]} c={c} />
        </group>
      );
    case "beanie":
      return <Block p={[0, 0.22, -0.01]} s={[0.54, 0.2, 0.54]} c={c} />;
    case "cap":
      return (
        <group>
          <Block p={[0, 0.25, -0.01]} s={[0.53, 0.12, 0.53]} c={c} />
          <Block p={[0, 0.2, 0.32]} s={[0.46, 0.03, 0.2]} c={c} />
        </group>
      );
    case "crown":
      return (
        <group>
          <Block p={[0, 0.3, 0]} s={[0.44, 0.1, 0.44]} c="#ffcc33" />
          {[-0.17, 0, 0.17].map((x) => (
            <Block key={x} p={[x, 0.39, 0.2]} s={[0.07, 0.1, 0.03]} c="#ffcc33" />
          ))}
        </group>
      );
    case "visor":
      return <Block p={[0, 0.05, 0.27]} s={[0.5, 0.12, 0.04]} c={c} emissive={c} />;
    case "mask":
      return <Block p={[0, -0.1, 0.26]} s={[0.4, 0.16, 0.03]} c={c} />;
    case "horns":
      return (
        <group>
          <Block p={[-0.18, 0.32, 0]} s={[0.07, 0.18, 0.07]} c={c} rot={[0, 0, 0.4]} />
          <Block p={[0.18, 0.32, 0]} s={[0.07, 0.18, 0.07]} c={c} rot={[0, 0, -0.4]} />
        </group>
      );
    default:
      return null;
  }
}

const sleeveLen: Record<string, number> = { none: 0, tee: 0.35, hoodie: 1, jacket: 1, labcoat: 1, vest: 0, tank: 0, stripes: 0.35, overalls: 0.35 };

/**
 * Block-style character built from simple boxes. Root origin is at the feet,
 * model faces +z. Procedural animation is driven by `pose`.
 */
export function AvatarModel({ avatar: a, pose, ghost = false }: { avatar: Avatar; pose: MutableRefObject<Pose>; ghost?: boolean }) {
  const root = useRef<THREE.Group>(null!);
  const body = useRef<THREE.Group>(null!);
  const lArm = useRef<THREE.Group>(null!);
  const rArm = useRef<THREE.Group>(null!);
  const lLeg = useRef<THREE.Group>(null!);
  const rLeg = useRef<THREE.Group>(null!);
  const head = useRef<THREE.Group>(null!);
  const phase = useRef(0);
  const face = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ map: faceTexture(a.face, a.colors.eyes), transparent: true, depthWrite: false });
    return m;
  }, [a.face, a.colors.eyes]);

  const sc = a.scale;
  const tw = (a.torso === "slim" ? 0.7 : a.torso === "broad" ? 0.92 : 0.8) * sc.width;
  const legH = 0.8 * sc.legs;
  const armH = 0.8 * sc.arms;
  const shirt = a.shirt !== "none";
  const torsoColor = shirt ? a.colors.shirt : a.colors.torso;
  const sleeve = sleeveLen[a.shirt] ?? 0;
  const pants = a.pants !== "none";
  const pantsLen = a.pants === "shorts" ? 0.45 : a.pants === "skirt" ? 0.4 : pants ? 1 : 0;
  const headScale = sc.head;
  const headGeo = a.head === "round" ? ROUND_HEAD : BOX;
  const headDims: [number, number, number] =
    a.head === "tall" ? [0.44, 0.58, 0.44] : a.head === "wide" ? [0.56, 0.44, 0.48] : a.head === "round" ? [0.5, 0.48, 0.5] : [0.48, 0.48, 0.48];

  useFrame((_, dt) => {
    const p = pose.current;
    const now = performance.now();
    const k = Math.min(1, dt * 12);
    const lerp = (o: THREE.Object3D, x: number, y = 0, z = 0) => {
      o.rotation.x += (x - o.rotation.x) * k;
      o.rotation.y += (y - o.rotation.y) * k;
      o.rotation.z += (z - o.rotation.z) * k;
    };
    const gait = p.mode === "walk" || p.mode === "run" || p.mode === "crawl" || p.mode === "downed";
    phase.current += dt * (gait ? Math.max(3, p.speed * 1.9) : 1.5);
    const s = Math.sin(phase.current);
    const amp = p.mode === "run" ? 0.95 : p.mode === "walk" ? 0.6 : 0;
    let bodyPitch = 0,
      bodyY = 0,
      bodyRoll = 0;
    let la = 0,
      ra = 0,
      ll = 0,
      rl = 0,
      laz = 0,
      raz = 0,
      headX = 0;

    switch (p.mode) {
      case "walk":
      case "run":
        la = s * amp;
        ra = -s * amp;
        ll = -s * amp;
        rl = s * amp;
        bodyY = Math.abs(Math.cos(phase.current)) * 0.05;
        break;
      case "jump":
        la = -2.6;
        ra = -2.6;
        ll = 0.4;
        rl = -0.3;
        break;
      case "crawl":
        bodyPitch = 1.35;
        bodyY = -0.55;
        la = -2.6 + s * 0.4;
        ra = -2.6 - s * 0.4;
        ll = s * 0.3;
        rl = -s * 0.3;
        headX = -1.1;
        break;
      case "downed":
        bodyPitch = 1.45;
        bodyY = -0.7;
        la = -2.8 + s * (p.speed > 0.1 ? 0.5 : 0.05);
        ra = -2.4 - s * (p.speed > 0.1 ? 0.5 : 0.05);
        ll = 0.1;
        rl = -0.1;
        headX = -1.2;
        break;
      case "hack":
      case "interact":
        la = -1.2 + Math.sin(now / 70) * 0.12;
        ra = -1.2 + Math.cos(now / 80) * 0.12;
        headX = 0.25;
        break;
      case "carried":
        bodyPitch = -1.5;
        bodyRoll = 0;
        la = -0.3 + s * 0.6 * (0.3 + p.struggle);
        ra = 0.3 - s * 0.6 * (0.3 + p.struggle);
        ll = s * 0.4 * (0.3 + p.struggle);
        rl = -s * 0.4 * (0.3 + p.struggle);
        break;
      case "carry":
        la = -2.9;
        ra = s * 0.4 * (p.speed > 0.1 ? 1 : 0.1);
        ll = -s * 0.5 * (p.speed > 0.1 ? 1 : 0);
        rl = s * 0.5 * (p.speed > 0.1 ? 1 : 0);
        break;
      case "podded":
        la = 0.1;
        ra = -0.1;
        laz = 0.25;
        raz = -0.25;
        headX = 0.3;
        bodyY = 0.25 + Math.sin(now / 600) * 0.06;
        break;
      default:
        la = Math.sin(now / 900) * 0.04;
        ra = -la;
    }
    // Hunter swing overrides the right arm.
    const sw = (now - p.swingAt) / 380;
    if (sw >= 0 && sw < 1) ra = sw < 0.35 ? -2.8 * (sw / 0.35) : -2.8 + 3.6 * ((sw - 0.35) / 0.65);

    lerp(lArm.current, la, 0, laz);
    lerp(rArm.current, ra, 0, raz);
    lerp(lLeg.current, ll);
    lerp(rLeg.current, rl);
    lerp(head.current, headX);
    body.current.rotation.x += (bodyPitch - body.current.rotation.x) * k;
    body.current.rotation.z += (bodyRoll - body.current.rotation.z) * k;
    body.current.position.y += (bodyY - body.current.position.y) * k;
    if (p.mode === "carried") body.current.position.z += (-0.1 - body.current.position.z) * k;
    else body.current.position.z += (0 - body.current.position.z) * k;
  });

  const baseScale = 0.86 * sc.height;
  const hipY = legH;
  const torsoH = 0.8;
  const shoulderY = hipY + torsoH - 0.06;
  const headY = hipY + torsoH + (headDims[1] * headScale) / 2 + 0.02;

  return (
    <group ref={root} scale={baseScale}>
      <group ref={body}>
        {/* Legs (pivot at hip) */}
        {[
          [lLeg, -0.2 * sc.width],
          [rLeg, 0.2 * sc.width],
        ].map(([ref, x], i) => (
          <group key={i} ref={ref as React.RefObject<THREE.Group>} position={[x as number, hipY, 0]}>
            <Block p={[0, -legH / 2, 0]} s={[0.38, legH, 0.38]} c={a.colors.legs} />
            {pantsLen > 0 && <Block p={[0, -(legH * pantsLen) / 2 + 0.005, 0]} s={[0.4, legH * pantsLen, 0.4]} c={a.colors.pants} />}
            {a.shoes !== "none" && <Block p={[0, -legH + 0.07, 0.03]} s={[0.41, a.shoes === "boots" ? 0.22 : 0.14, 0.44]} c={a.colors.shoes} />}
          </group>
        ))}
        {a.pants === "skirt" && <Block p={[0, hipY - 0.12, 0]} s={[tw + 0.12, 0.3, 0.5]} c={a.colors.pants} />}
        {/* Torso */}
        <Block p={[0, hipY + torsoH / 2, 0]} s={[tw, torsoH, 0.4]} c={torsoColor} />
        {a.shirt === "stripes" && [0.2, 0.45, 0.7].map((y) => <Block key={y} p={[0, hipY + y, 0]} s={[tw + 0.01, 0.08, 0.41]} c={a.colors.shirtAccent} />)}
        {(a.shirt === "jacket" || a.shirt === "labcoat" || a.shirt === "hoodie") && (
          <Block p={[0, hipY + torsoH / 2, 0.205]} s={[0.12, torsoH, 0.01]} c={a.colors.shirtAccent} />
        )}
        {a.shirt === "labcoat" && <Block p={[0, hipY - 0.2, 0]} s={[tw + 0.04, 0.45, 0.44]} c={a.colors.shirt} />}
        {a.shirt === "hoodie" && <Block p={[0, shoulderY + 0.02, -0.2]} s={[tw * 0.7, 0.2, 0.12]} c={a.colors.shirt} />}
        {a.shirt === "vest" && <Block p={[0, hipY + torsoH / 2, 0]} s={[tw + 0.02, torsoH - 0.1, 0.42]} c={a.colors.shirtAccent} />}
        {a.shirt === "overalls" && <Block p={[0, hipY + 0.25, 0.005]} s={[tw * 0.7, 0.5, 0.41]} c={a.colors.pants} />}
        {a.accessory === "backpack" && <Block p={[0, hipY + 0.42, -0.3]} s={[tw * 0.75, 0.6, 0.22]} c={a.colors.accessory} />}
        {a.accessory === "scarf" && <Block p={[0, shoulderY + 0.02, 0.02]} s={[tw * 0.75, 0.14, 0.46]} c={a.colors.accessory} />}
        {/* Arms (pivot at shoulder) */}
        {[
          [lArm, -(tw / 2 + 0.19)],
          [rArm, tw / 2 + 0.19],
        ].map(([ref, x], i) => (
          <group key={i} ref={ref as React.RefObject<THREE.Group>} position={[x as number, shoulderY, 0]}>
            <Block p={[0, -armH / 2 + 0.06, 0]} s={[0.36, armH, 0.38]} c={a.colors.arms} />
            {sleeve > 0 && <Block p={[0, -(armH * sleeve) / 2 + 0.065, 0]} s={[0.38, armH * sleeve, 0.4]} c={a.colors.shirt} />}
            {i === 1 && pose.current.hunter && (
              <group position={[0, -armH + 0.1, 0.05]} rotation={[Math.PI / 2, 0, 0]}>
                <Block p={[0, 0.3, 0]} s={[0.09, 0.85, 0.09]} c="#1d1f24" />
                <Block p={[0, 0.78, 0]} s={[0.13, 0.16, 0.13]} c="#ff2a3d" emissive="#ff2a3d" />
              </group>
            )}
          </group>
        ))}
        {/* Head */}
        <group ref={head} position={[0, hipY + torsoH + 0.02, 0]}>
          <group position={[0, headY - hipY - torsoH - 0.02, 0]} scale={headScale}>
            <mesh geometry={headGeo} material={mat(a.colors.head)} scale={headDims} castShadow />
            <mesh position={[0, -0.02, headDims[2] / 2 + 0.006]} material={face}>
              <planeGeometry args={[headDims[0] * 0.95, headDims[1] * 0.95]} />
            </mesh>
            {pose.current.hunter && (
              <group position={[0, 0.02, headDims[2] / 2 + 0.012]}>
                <Block p={[-0.1, 0.02, 0]} s={[0.1, 0.05, 0.01]} c="#ff2a3d" emissive="#ff2a3d" />
                <Block p={[0.1, 0.02, 0]} s={[0.1, 0.05, 0.01]} c="#ff2a3d" emissive="#ff2a3d" />
              </group>
            )}
            <Hair a={a} />
            <Accessory a={a} />
          </group>
        </group>
      </group>
      {ghost && null}
    </group>
  );
}
