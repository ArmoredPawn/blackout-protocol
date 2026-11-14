/**
 * End-to-end gameplay test with two bots that path-find through the real map:
 * survivor hacks a terminal → hunter downs, carries and pods the survivor.
 */
import { Client, type Room } from "@colyseus/sdk";
import { CELL, DEFAULT_AVATAR, MapRuntime, ROOM_NAME, getBuiltinMap, positionIsClear, isWalkableTile, cellCenter } from "@bp/shared";

const URL = process.env.URL ?? "http://localhost:2599";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ok = (c: unknown, m: string) => {
  if (!c) {
    console.error("FAIL:", m);
    process.exit(1);
  }
  console.log("ok -", m);
};
const opts = (n: string) => ({ name: n, avatar: JSON.stringify(DEFAULT_AVATAR), token: ("t" + n).toLowerCase().padEnd(10, "0") });

const a = await new Client(URL).create(ROOM_NAME, opts("Alpha"));
const b = await new Client(URL).joinById(a.roomId, opts("Bravo"));
const c = await new Client(URL).joinById(a.roomId, opts("Charlie"));
const all = [a, b, c];
const sonarHits: string[][] = [];
for (const r of all) {
  r.onMessage("*", () => {});
  r.onMessage("reveal", (m: any) => sonarHits.push(m.ids));
}
for (const r of all) r.send("chooseAbility", "sonar");
a.send("settings", { headStartSeconds: 0, skillChecks: false, downedRecoverSeconds: 60, captureSeconds: 60, rescueSeconds: 2 });
b.send("ready", true);
c.send("ready", true);
await wait(300);
a.send("start");
await wait(5600);
const st = () => a.state as any;
ok(st().phase === "playing", "round playing (3 players)");
const rt = new MapRuntime(getBuiltinMap(st().mapId)!, st().mapTier);
const me = (r: Room) => st().players.get(r.sessionId);
const hunter = all.find((r) => me(r).role === "hunter")!;
const [s1, s2] = all.filter((r) => r !== hunter);
const seqs = new Map<Room, number>();
function path(fx: number, fz: number, tx: number, tz: number): [number, number][] {
  const W = rt.width, D = rt.depth;
  const start = Math.floor(fz / CELL) * W + Math.floor(fx / CELL);
  const goal = Math.floor(tz / CELL) * W + Math.floor(tz / CELL) * 0 + Math.floor(tx / CELL);
  const prev = new Map<number, number>([[start, -1]]);
  const q = [start];
  while (q.length) {
    const k = q.shift()!;
    if (k === goal) break;
    const x = k % W, z = Math.floor(k / W);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz, nk = nz * W + nx;
      if (prev.has(nk) || !rt.inBounds(nx, nz)) continue;
      const near = nk === goal;
      if (!near && (!isWalkableTile(rt.tileAt(0, nx, nz)) || !positionIsClear(rt, cellCenter(nx), 0, cellCenter(nz), false))) continue;
      prev.set(nk, k);
      q.push(nk);
    }
  }
  const out: [number, number][] = [];
  for (let k = goal; k !== -1 && k !== undefined; k = prev.get(k)!) out.unshift([cellCenter(k % W), cellCenter(Math.floor(k / W))]);
  return out.length > 1 ? out : [];
}

async function walk(r: Room, tx: number, tz: number, stopDist = 1.6) {
  const p = me(r);
  const pts = path(p.x, p.z, tx, tz);
  let x = p.x, z = p.z;
  for (const [px, pz] of pts) {
    while (Math.hypot(px - x, pz - z) > 0.01) {
      if (Math.hypot(tx - x, tz - z) < stopDist) return;
      const d = Math.hypot(px - x, pz - z), step = Math.min(d, 0.24);
      x += ((px - x) / d) * step;
      z += ((pz - z) / d) * step;
      const s = (seqs.get(r) ?? 0) + 1;
      seqs.set(r, s);
      r.send("move", { x, y: 0, z, ry: Math.atan2(tx - x, tz - z), a: 1 | 4, s });
      await wait(50);
    }
  }
}



async function downAndPickUp(target: Room) {
  const t = me(target);
  await walk(hunter, t.x, t.z, 1.3);
  const h = me(hunter);
  const tt = me(target);
  hunter.send("swing", { ry: Math.atan2(tt.x - h.x, tt.z - h.z) });
  await wait(300);
  ok(me(target).status === "downed", `${me(target).name} downed`);
  hunter.send("hold", true);
  await wait(900);
  hunter.send("hold", false);
  ok(me(target).status === "carried", `${me(target).name} picked up`);
}

// Struggle free.
await downAndPickUp(s1);
for (let i = 0; i < 40 && me(s1).status === "carried"; i++) {
  s1.send("struggle");
  await wait(80);
}
ok(me(s1).status === "free" && me(hunter).carrying === "", "survivor struggled free; hunter stunned");
await wait(1800); // stun + protection wear off
// Hunter ability: Sonar reveals nearby Survivors to the Hunter only.
hunter.send("ability", { slot: -1 });
await wait(400);
ok(me(hunter).abilityReadyAt > st().now, "sonar went on cooldown");
ok(sonarHits.length >= 1 && sonarHits[0].length >= 1, `sonar revealed ${sonarHits[0]?.length ?? 0} survivor(s)`);

// Capture, then a teammate rescues.
await wait(1500);
await downAndPickUp(s1);
const h = me(hunter);
const pod = rt.pods.filter((p) => p.f === 0).sort((p1, p2) => Math.hypot(p1.wx - h.x, p1.wz - h.z) - Math.hypot(p2.wx - h.x, p2.wz - h.z))[0];
await walk(hunter, pod.wx, pod.wz, 1.9);
hunter.send("hold", true);
await wait(1400);
hunter.send("hold", false);
ok(me(s1).status === "podded", `${me(s1).name} podded in ${pod.id}`);
await walk(s2, pod.wx, pod.wz, 1.9);
s2.send("hold", true);
await wait(2600);
s2.send("hold", false);
ok(me(s1).status === "free", `${me(s2).name} rescued ${me(s1).name}`);
ok(me(s2).statRescues === 1, "rescue counted in stats");
for (const r of all) await r.leave();
console.log("RESCUE PASSED");
process.exit(0);
