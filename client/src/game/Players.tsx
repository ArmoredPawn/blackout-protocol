import { Billboard, Text } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import {
  AF,
  INTERP_DELAY_MS,
  NET_SEND_HZ,
  jumpVelocity,
  moveSpeed,
  parseAvatar,
  parseEffects,
  stepBody,
  DEFAULT_AVATAR,
} from "@bp/shared";
import { net, type InterpSample } from "../net/connection";
import { useApp } from "../store";
import type { PlayerSnap } from "../net/types";
import { AvatarModel, newPose, type Pose, type PoseMode } from "./Avatar3D";
import { audio } from "./audio";
import { input } from "./input";
import { ceilingAt } from "./mapGeometry";
import { game, openExitMask } from "./state";

const tmpV = new THREE.Vector3();

function poseFor(p: PlayerSnap, anim: number, speed: number, local: boolean): PoseMode {
  switch (p.status) {
    case "downed":
      return "downed";
    case "carried":
      return "carried";
    case "podded":
      return "podded";
  }
  if (p.carrying) return "carry";
  if (p.hacking) return "hack";
  if (anim & AF.crawling) return "crawl";
  if (!(anim & AF.grounded)) return "jump";
  if (speed > 0.3) return speed > 4 ? "run" : "walk";
  void local;
  return "idle";
}

/** Sample the interpolation buffer at render time (now − delay). */
function sample(buf: InterpSample[] | undefined, t: number): InterpSample | null {
  if (!buf || !buf.length) return null;
  if (t <= buf[0].t) return buf[0];
  for (let i = buf.length - 1; i >= 0; i--) {
    const a = buf[i];
    if (a.t <= t) {
      const b = buf[i + 1];
      if (!b) return a;
      const k = (t - a.t) / Math.max(1, b.t - a.t);
      let dr = b.ry - a.ry;
      while (dr > Math.PI) dr -= Math.PI * 2;
      while (dr < -Math.PI) dr += Math.PI * 2;
      return { t, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, ry: a.ry + dr * k, anim: b.anim };
    }
  }
  return buf[0];
}

function NameTag({ name, color, y, xray }: { name: string; color: string; y: number; xray: boolean }) {
  return (
    <Billboard position={[0, y, 0]}>
      <Text fontSize={0.26} color={color} outlineWidth={0.025} outlineColor="#000" anchorY="bottom" renderOrder={xray ? 20 : 0} material-depthTest={!xray}>
        {name}
      </Text>
    </Billboard>
  );
}

/** Translucent silhouette shown through walls for revealed players. */
function RevealMarker({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, 1, 0]} renderOrder={30}>
        <capsuleGeometry args={[0.35, 1.1, 4, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.45} depthTest={false} depthWrite={false} />
      </mesh>
    </group>
  );
}

function RemotePlayer({ id }: { id: string }) {
  const p = useApp((s) => s.snap?.players[id]);
  const avatarJson = p?.avatar;
  const avatar = useMemo(() => parseAvatar(avatarJson ?? "") ?? DEFAULT_AVATAR, [avatarJson]);
  const group = useRef<THREE.Group>(null!);
  const pose = useRef<Pose>(newPose());
  const marker = useRef<THREE.Group>(null!);
  const last = useRef({ x: 0, z: 0, step: 0 });
  const myRole = useApp((s) => (s.snap && s.myId ? s.snap.players[s.myId]?.role : "none"));

  useEffect(
    () =>
      net.fx.on((e) => {
        if (e.kind === "swing" && e.id === id) pose.current.swingAt = performance.now();
      }),
    [id],
  );

  useFrame((_, dt) => {
    const snapP = net.snap?.players[id];
    if (!snapP || !group.current) return;
    const s = sample(net.buffers.get(id), performance.now() - INTERP_DELAY_MS);
    if (!s) return;
    let { x, y, z, ry } = s;
    // Carried players ride on the Hunter's shoulder.
    if (snapP.status === "carried" && snapP.carriedBy) {
      const hs = snapP.carriedBy === net.room?.sessionId ? { ...game.body, ry: game.ry } : sample(net.buffers.get(snapP.carriedBy), performance.now() - INTERP_DELAY_MS);
      if (hs) {
        x = hs.x - Math.sin(hs.ry) * 0.1;
        y = hs.y + 1.75;
        z = hs.z - Math.cos(hs.ry) * 0.1;
        ry = hs.ry + Math.PI / 2;
      }
    }
    if (snapP.status === "podded") y += 0.24;
    group.current.position.set(x, y, z);
    group.current.rotation.y = ry;
    const moved = Math.hypot(x - last.current.x, z - last.current.z);
    const speed = dt > 0 ? moved / dt : 0;
    last.current.x = x;
    last.current.z = z;
    const P = pose.current;
    P.speed += (speed - P.speed) * Math.min(1, dt * 8);
    P.hunter = snapP.role === "hunter";
    P.struggle = snapP.struggle;
    P.mode = poseFor(snapP, s.anim, P.speed, false);
    group.current.visible = snapP.status !== "escaped" && snapP.status !== "eliminated" && snapP.status !== "spectating" && snapP.status !== "lobby";
    // Footsteps (positional).
    if ((P.mode === "walk" || P.mode === "run") && s.anim & AF.grounded) {
      last.current.step += moved;
      const eff = parseEffects(snapP.effects);
      if (last.current.step > 1.7 && !eff.has("ghost")) {
        last.current.step = 0;
        audio.play(P.hunter ? "stepHeavy" : "step", { x, y, z }, P.hunter ? 1 : 0.6);
      }
    }
    // Reveal marker.
    const rv = net.reveals.get(id);
    const revealed = !!rv && rv.until > performance.now();
    if (marker.current) marker.current.visible = revealed || (myRole === "survivor" && snapP.role === "survivor" && (snapP.status === "podded" || snapP.status === "downed"));
  });

  if (!p) return null;
  const teammate = myRole !== "none" && p.role === myRole;
  const tagColor = p.role === "hunter" ? "#ff5b6a" : p.status === "downed" ? "#ffb020" : p.status === "podded" ? "#ff4d5e" : "#e8f0ff";
  const markerColor = p.role === "hunter" ? "#ff3048" : p.status === "podded" ? "#ff4d5e" : "#4ad6ff";
  return (
    <group ref={group}>
      <AvatarModel avatar={avatar} pose={pose} />
      <NameTag name={p.name} color={tagColor} y={2.15} xray={teammate && (p.status === "podded" || p.status === "downed")} />
      <group ref={marker} visible={false}>
        <RevealMarker color={markerColor} />
      </group>
    </group>
  );
}

/** Local player: client-side prediction with the shared physics; server validates. */
function LocalPlayer() {
  const group = useRef<THREE.Group>(null!);
  const myId = useApp((s) => s.myId);
  const avatar = useApp((s) => s.prefs.avatar);
  const pose = useRef<Pose>(game.pose);
  const lastGrounded = useRef(true);

  useEffect(() => {
    const offFx = net.fx.on((e) => {
      if (e.kind === "swing" && e.id === myId) pose.current.swingAt = performance.now();
    });
    const offInput = input.on((a, down) => {
      if (!down) return;
      const me = net.me();
      if (!me) return;
      if (a === "jump" && me.status === "carried") {
        net.send("struggle");
        audio.play("struggle");
      }
    });
    return () => {
      offFx();
      offInput();
    };
  }, [myId]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const me = net.me();
    const rt = game.rt;
    if (!me || !rt || !group.current) return;
    const settings = useApp.getState().settings;
    const body = game.body;
    const now = net.serverNow();

    // New round or server correction → snap to authoritative position.
    if (me.corr !== game.lastCorr) {
      game.lastCorr = me.corr;
      body.x = me.x;
      body.y = me.y;
      body.z = me.z;
      body.vy = 0;
      if (game.lastRound !== useApp.getState().snap?.round) {
        game.lastRound = useApp.getState().snap?.round ?? 0;
        // Start with the camera in the most open direction so it isn't jammed against a wall.
        let bestYaw = me.ry,
          bestFree = -1;
        for (let i = 0; i < 16; i++) {
          const yaw = (i / 16) * Math.PI * 2;
          let free = 0;
          for (let s = 0.5; s <= 9; s += 0.5) {
            // Camera sits behind the player (opposite of the look direction).
            if (rt.pointSolid(me.x - Math.sin(yaw) * s, me.y + 2.2, me.z - Math.cos(yaw) * s)) break;
            free = s;
          }
          if (free > bestFree) {
            bestFree = free;
            bestYaw = yaw;
          }
        }
        game.yaw = bestYaw;
        game.ry = bestYaw;
      }
    }

    const canMove = (me.status === "free" || me.status === "downed") && !(me.role === "hunter" && net.snap?.phase === "headstart");
    const playing = net.snap?.phase === "playing" || net.snap?.phase === "headstart";
    let moveX = 0,
      moveZ = 0;
    if (canMove && playing && !input.typing()) {
      const f = (input.isDown("forward") ? 1 : 0) - (input.isDown("back") ? 1 : 0) + input.stick.y;
      const r = (input.isDown("right") ? 1 : 0) - (input.isDown("left") ? 1 : 0) + input.stick.x;
      const sy = Math.sin(game.yaw),
        cy = Math.cos(game.yaw);
      moveX = sy * f - cy * r;
      moveZ = cy * f + sy * r;
      const len = Math.hypot(moveX, moveZ);
      if (len > 1) {
        moveX /= len;
        moveZ /= len;
      }
    }
    const effects = parseEffects(me.effects);
    const wantCrawl = me.role === "survivor" && me.status === "free" && (input.isDown("crawl") || input.crawlToggled);
    const crawling = me.status === "downed" ? true : wantCrawl;
    const speed = moveSpeed(me.role, me.status, crawling && me.status !== "downed", effects, now, settings, !!me.carrying);
    const checkActive = !!useApp.getState().skillCheck;

    if (canMove && playing) {
      stepBody(
        rt,
        body,
        {
          dx: moveX,
          dz: moveZ,
          jump: input.isDown("jump") && !checkActive && !input.typing(),
          crawl: crawling,
          speed,
          jumpVelocity: jumpVelocity(settings, me.status, crawling),
        },
        dt,
        openExitMask(),
      );
    } else if (me.status === "carried" || me.status === "podded" || !playing) {
      const s = sample(net.buffers.get(me.id), performance.now() - INTERP_DELAY_MS);
      if (s) {
        body.x = s.x;
        body.y = s.y;
        body.z = s.z;
      }
    }

    // Facing: mouse-lock → face camera; otherwise face movement direction.
    const moving = Math.hypot(moveX, moveZ) > 0.05 && speed > 0;
    let targetRy = game.ry;
    if (input.mouseLocked || game.firstPerson) targetRy = game.yaw;
    else if (moving) targetRy = Math.atan2(moveX, moveZ);
    let d = targetRy - game.ry;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    game.ry += d * Math.min(1, dt * 14);

    // Render.
    let rx = body.x,
      ry = body.y,
      rz = body.z,
      rot = game.ry;
    if (me.status === "carried" && me.carriedBy) {
      const hs = sample(net.buffers.get(me.carriedBy), performance.now() - INTERP_DELAY_MS);
      if (hs) {
        rx = hs.x - Math.sin(hs.ry) * 0.1;
        ry = hs.y + 1.75;
        rz = hs.z - Math.cos(hs.ry) * 0.1;
        rot = hs.ry + Math.PI / 2;
      }
    }
    if (me.status === "podded") ry += 0.24;
    group.current.position.set(rx, ry, rz);
    group.current.rotation.y = rot;
    group.current.visible = !game.firstPerson && me.status !== "escaped" && me.status !== "eliminated" && me.status !== "spectating" && playing;

    const hspeed = moving ? speed : 0;
    const P = pose.current;
    P.speed += (hspeed - P.speed) * Math.min(1, dt * 10);
    P.hunter = me.role === "hunter";
    P.struggle = me.struggle;
    const anim = (body.grounded ? AF.grounded : 0) | (body.crawling ? AF.crawling : 0) | (moving ? AF.moving : 0);
    P.mode = poseFor(me, anim, P.speed, true);

    // Footsteps & landing.
    if (body.grounded && moving && !body.crawling) {
      game.stepDist += hspeed * dt;
      if (game.stepDist > 1.7) {
        game.stepDist = 0;
        if (!effects.has("ghost")) audio.play(P.hunter ? "stepHeavy" : "step", undefined, 0.45);
      }
    }
    if (body.grounded && !lastGrounded.current) audio.play("land", undefined, 0.4);
    if (!body.grounded && lastGrounded.current && body.vy > 1) audio.play("jump", undefined, 0.4);
    lastGrounded.current = body.grounded;

    // Network send at 20 Hz.
    const t = performance.now();
    if (canMove && playing && t - game.lastSendAt >= 1000 / NET_SEND_HZ) {
      game.lastSendAt = t;
      net.send("move", { x: +body.x.toFixed(3), y: +body.y.toFixed(3), z: +body.z.toFixed(3), ry: +game.ry.toFixed(3), a: anim, s: game.seq++ });
    }
  });

  return (
    <group ref={group}>
      <AvatarModel avatar={avatar} pose={pose} />
    </group>
  );
}

/** Roblox-style third-person orbit camera with wall collision and ceiling clamp. */
function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const fov = useApp((s) => s.prefs.fov);
  useEffect(() => {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }, [fov, camera]);

  useFrame((_, dt) => {
    const rt = game.rt;
    const build = game.build;
    const me = net.me();
    if (!rt || !build || !me) return;
    const { sensitivity, invertY } = useApp.getState().prefs;
    const look = input.consumeLook();
    game.yaw -= look.dx * 0.0042 * sensitivity;
    game.pitch += look.dy * 0.0036 * sensitivity * (invertY ? -1 : 1);
    game.pitch = Math.max(-1.1, Math.min(1.35, game.pitch));
    const wheel = input.consumeWheel();
    game.dist = Math.max(0.5, Math.min(16, game.dist + wheel * 0.9));
    game.firstPerson = game.dist < 1.1;

    // Spectators follow another living player.
    let tx = game.body.x,
      ty = game.body.y,
      tz = game.body.z;
    const spectating = me.status === "eliminated" || me.status === "escaped" || me.status === "spectating";
    if (spectating && net.snap) {
      const alive = Object.values(net.snap.players).filter((p) => ["free", "downed", "carried", "podded"].includes(p.status));
      if (input.lmbClicks > 0) {
        game.spectateIdx++;
        input.lmbClicks = 0;
      }
      const target = alive.length ? alive[game.spectateIdx % alive.length] : null;
      const s = target ? sample(net.buffers.get(target.id), performance.now() - INTERP_DELAY_MS) : null;
      if (s) {
        tx = s.x;
        ty = s.y;
        tz = s.z;
      }
      game.firstPerson = false;
    } else if (me.status === "carried" && me.carriedBy) {
      const s = sample(net.buffers.get(me.carriedBy), performance.now() - INTERP_DELAY_MS);
      if (s) {
        tx = s.x;
        ty = s.y + 0.6;
        tz = s.z;
      }
    }
    const headH = game.body.crawling && !spectating ? 0.75 : me.status === "downed" ? 0.6 : 1.55;
    const target = tmpV.set(tx, ty + headH, tz);
    const cp = Math.cos(game.pitch),
      sp = Math.sin(game.pitch);
    const fx = Math.sin(game.yaw) * cp,
      fy = -sp,
      fz = Math.cos(game.yaw) * cp;
    // March back from the head until we hit something.
    let dist = game.firstPerson ? 0 : game.dist;
    const ceil = ceilingAt(build, rt, tx, ty, tz);
    const openMask = openExitMask();
    for (let s = 0.25; s <= dist; s += 0.2) {
      const px = target.x - fx * s,
        py = target.y - fy * s,
        pz = target.z - fz * s;
      if (rt.pointSolid(px, py, pz, openMask) || py > ceilingAt(build, rt, px, ty, pz) - 0.1 || py > ceil - 0.1) {
        dist = Math.max(0.2, s - 0.35);
        break;
      }
    }
    const shake = game.shake;
    game.shake = Math.max(0, game.shake - dt * 3);
    camera.position.set(
      target.x - fx * dist + (Math.random() - 0.5) * shake * 0.2,
      target.y - fy * dist + (Math.random() - 0.5) * shake * 0.2,
      target.z - fz * dist,
    );
    camera.lookAt(target.x + fx, target.y + fy, target.z + fz);
    audio.setListener({ x: camera.position.x, y: camera.position.y, z: camera.position.z }, { x: fx, y: fy, z: fz });
  });
  return null;
}

export function Players() {
  const ids = useApp((s) => (s.snap ? Object.keys(s.snap.players).sort().join(",") : ""));
  const myId = useApp((s) => s.myId);
  return (
    <group>
      <LocalPlayer />
      {ids
        .split(",")
        .filter((id) => id && id !== myId)
        .map((id) => (
          <RemotePlayer key={id} id={id} />
        ))}
      <CameraRig />
    </group>
  );
}
