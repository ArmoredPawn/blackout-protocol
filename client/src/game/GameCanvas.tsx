import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { POWERUP_MAP, type FxEvent } from "@bp/shared";
import { net } from "../net/connection";
import { useApp } from "../store";
import { audio } from "./audio";
import { input } from "./input";
import { MapView } from "./MapView";
import { Objects } from "./Objects";
import { Players } from "./Players";
import { game, useMapRuntime } from "./state";

/** Translates input edges into server intents (hold-to-interact, swing, abilities). */
function GameControls() {
  useEffect(() => {
    const off = input.on((a, down) => {
      const app = useApp.getState();
      const me = net.me();
      if (!me) return;
      if (a === "interact") net.send("hold", down);
      if (!down) return;
      if (a === "mouseLock") input.setMouseLock(!input.mouseLocked);
      if (a === "map") useApp.setState({ showMap: !app.showMap });
      if (net.snap?.phase !== "playing") return;
      if (a === "ability") net.send("ability", { slot: me.role === "hunter" ? -1 : 0 });
      if (a === "slot1") net.send("ability", { slot: 0 });
      if (a === "slot2") net.send("ability", { slot: 1 });
      if (a === "slot3") net.send("ability", { slot: 2 });
    });
    return () => {
      off();
      net.send("hold", false);
    };
  }, []);

  useFrame(() => {
    if (input.lmbClicks > 0) {
      const me = net.me();
      if (me?.role === "hunter" && me.status === "free" && net.snap?.phase === "playing") {
        net.send("swing", { ry: input.mouseLocked ? game.yaw : game.ry });
      }
      if (me && !["eliminated", "escaped", "spectating"].includes(me.status)) input.lmbClicks = 0;
    }
  });
  return null;
}

interface Burst {
  pos: THREE.Vector3;
  color: THREE.Color;
  born: number;
  life: number;
  count: number;
  spread: number;
}

/** Event-driven sounds, camera shake and particle bursts. */
function FxLayer() {
  const bursts = useRef<Burst[]>([]);
  const points = useRef<THREE.Points>(null!);
  const MAX = 600;
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(MAX * 3), 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(MAX * 3), 3));
    return g;
  }, []);
  const seeds = useMemo(() => Array.from({ length: MAX }, () => new THREE.Vector3(Math.random() - 0.5, Math.random(), Math.random() - 0.5).normalize()), []);

  useEffect(() => {
    const add = (x: number, y: number, z: number, color: string, count = 40, spread = 2.5, life = 0.9) =>
      bursts.current.push({ pos: new THREE.Vector3(x, y, z), color: new THREE.Color(color), born: performance.now(), life: life * 1000, count, spread });
    return net.fx.on((e: FxEvent) => {
      const at = e.x !== undefined ? { x: e.x, y: e.y ?? 0, z: e.z ?? 0 } : undefined;
      const myId = net.room?.sessionId;
      const me = net.me();
      switch (e.kind) {
        case "swing":
          audio.play("swing", positionOf(e.id));
          break;
        case "down":
          audio.play("hit", at);
          if (at) add(at.x, at.y + 1, at.z, "#ff3048", 50, 3);
          if (e.target === myId) game.shake = 1.2;
          break;
        case "blocked":
          audio.play("blocked", at);
          if (at) add(at.x, at.y + 1, at.z, "#ffd84a", 40, 2.5);
          break;
        case "pickup":
          audio.play("pickup", positionOf(e.id));
          break;
        case "pod":
          audio.play("pod", at);
          if (at) add(at.x, at.y + 1.2, at.z, "#7fdcff", 60, 1.5, 1.4);
          break;
        case "rescue":
          audio.play("rescue", at);
          if (at) add(at.x, at.y + 1.2, at.z, "#38ff9c", 60, 2.5);
          break;
        case "eliminated":
          audio.play("eliminated", at);
          if (at) add(at.x, at.y + 1.2, at.z, "#ff4d5e", 80, 3, 1.4);
          break;
        case "escape":
          audio.play("escape", e.id === myId ? undefined : at);
          if (at) add(at.x, at.y + 1, at.z, "#eaffff", 60, 3);
          break;
        case "hacked":
          audio.play("hacked", at);
          if (at) add(at.x, at.y + 1.2, at.z, "#38ff9c", 50, 2);
          break;
        case "alarm":
          audio.play("alarm", at, me?.role === "hunter" ? 1.4 : 1);
          if (me?.role === "hunter" && at && e.ref) net.reveals.set(`term:${e.ref}`, { until: performance.now() + 2500, kind: "alarm" });
          if (e.id === myId) audio.play("skillFail");
          break;
        case "exitsPowered":
          audio.play("exitsPowered");
          break;
        case "exitOpen":
          audio.play("exitOpen", at);
          break;
        case "ability": {
          const def = e.ability ? POWERUP_MAP[e.ability] : undefined;
          if (!def || !at) break;
          audio.play(def.team === "hunter" ? "abilityHunter" : "abilitySurvivor", e.id === myId ? undefined : at);
          add(at.x, at.y + 1, at.z, def.color, e.ability === "sonar" ? 140 : 50, e.ability === "sonar" ? 14 : 2.5, e.ability === "sonar" ? 1.2 : 0.8);
          break;
        }
        case "struggleFree":
          audio.play("blocked", at);
          break;
        case "recover":
          audio.play("recover", at);
          break;
        case "trap":
          audio.play("trap", at);
          if (e.target === myId) game.shake = 0.8;
          break;
        case "powerupGet":
          audio.play("powerupGet");
          if (e.ability) useApp.getState().toast(`Picked up ${POWERUP_MAP[e.ability]?.name ?? "a powerup"}`, "good");
          break;
      }
    });
  }, []);

  useFrame(() => {
    const now = performance.now();
    bursts.current = bursts.current.filter((b) => now - b.born < b.life);
    const pos = geo.getAttribute("position") as THREE.BufferAttribute;
    const col = geo.getAttribute("color") as THREE.BufferAttribute;
    let n = 0;
    for (const b of bursts.current) {
      const k = (now - b.born) / b.life;
      for (let i = 0; i < b.count && n < MAX; i++, n++) {
        const s = seeds[(i * 7 + Math.floor(b.born)) % MAX];
        const r = b.spread * Math.sqrt(k);
        pos.setXYZ(n, b.pos.x + s.x * r, b.pos.y + s.y * r * 0.6 - k * k * 1.2, b.pos.z + s.z * r);
        const fade = 1 - k;
        col.setXYZ(n, b.color.r * fade, b.color.g * fade, b.color.b * fade);
      }
    }
    for (let i = n; i < MAX; i++) pos.setXYZ(i, 0, -999, 0);
    pos.needsUpdate = true;
    col.needsUpdate = true;
    geo.setDrawRange(0, Math.max(1, n));
  });

  return (
    <points ref={points} geometry={geo} frustumCulled={false}>
      <pointsMaterial size={0.14} vertexColors transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
    </points>
  );
}

function positionOf(id?: string) {
  const p = id ? net.snap?.players[id] : undefined;
  return p ? { x: p.x, y: p.y, z: p.z } : undefined;
}

/** Survivors feel a heartbeat-like pulse when a Hunter is near. */
function ProximityPulse() {
  const next = useRef(0);
  useFrame(() => {
    const me = net.me();
    const snap = net.snap;
    if (!me || !snap || me.role !== "survivor" || snap.phase !== "playing" || me.status !== "free") return;
    let best = Infinity;
    for (const p of Object.values(snap.players)) {
      if (p.role !== "hunter") continue;
      best = Math.min(best, Math.hypot(p.x - game.body.x, (p.y - game.body.y) * 2, p.z - game.body.z));
    }
    if (best > 24) return;
    const now = performance.now();
    if (now < next.current) return;
    const interval = 380 + (best / 24) * 1100;
    next.current = now + interval;
    audio.play("pulse", undefined, 0.4 + (1 - best / 24) * 0.8);
  });
  return null;
}

function Lighting() {
  const rt = game.rt!;
  const quality = useApp((s) => s.prefs.quality);
  const L = rt.def.lighting;
  const dir = useRef<THREE.DirectionalLight>(null!);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    scene.background = new THREE.Color(L.sky);
    scene.fog = new THREE.FogExp2(L.fog, L.fogDensity * (quality === "low" ? 1.25 : 1));
    return () => {
      scene.fog = null;
    };
  }, [scene, L.sky, L.fog, L.fogDensity, quality]);
  useFrame(() => {
    if (!dir.current) return;
    const b = game.body;
    dir.current.position.set(b.x + 8, b.y + 18, b.z + 6);
    dir.current.target.position.set(b.x, b.y, b.z);
    dir.current.target.updateMatrixWorld();
  });
  const shadowSize = quality === "high" ? 2048 : 1024;
  return (
    <>
      <ambientLight color={L.ambient} intensity={L.ambientIntensity} />
      <hemisphereLight color={L.ambient} groundColor="#1a1410" intensity={0.35} />
      <directionalLight
        ref={dir}
        intensity={0.55}
        color={L.ambient}
        castShadow={quality !== "low"}
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
        shadow-camera-near={1}
        shadow-camera-far={60}
        shadow-bias={-0.0006}
      />
    </>
  );
}

function World() {
  const map = useMapRuntime();
  const theme = map?.rt.def.theme;
  useEffect(() => {
    audio.ambient(theme ?? null);
    return () => audio.ambient(null);
  }, [theme]);
  if (!map) return null;
  return (
    <>
      <Lighting />
      <MapView rt={map.rt} build={map.build} />
      <Objects rt={map.rt} />
      <Players />
      <FxLayer />
      <GameControls />
      <ProximityPulse />
    </>
  );
}

export function GameCanvas() {
  const quality = useApp((s) => s.prefs.quality);
  const wrap = useRef<HTMLDivElement>(null!);
  useEffect(() => {
    input.attach();
    return input.bindCanvas(wrap.current);
  }, []);
  const dpr: [number, number] = quality === "high" ? [1, 2] : quality === "medium" ? [1, 1.5] : [0.75, 1];
  return (
    <div ref={wrap} className="game-canvas" onContextMenu={(e) => e.preventDefault()}>
      <Canvas
        shadows={quality !== "low" ? { type: THREE.PCFSoftShadowMap } : false}
        dpr={dpr}
        gl={{ antialias: quality !== "low", powerPreference: "high-performance" }}
        camera={{ fov: 70, near: 0.1, far: 220, position: [0, 5, 10] }}
        onPointerDown={() => audio.init()}
      >
        <World />
      </Canvas>
    </div>
  );
}
