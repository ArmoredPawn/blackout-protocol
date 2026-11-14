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
for (const r of [a, b]) r.onMessage("*", () => {});
a.send("settings", { headStartSeconds: 0, skillChecks: false, hackSpeed: 3, intermissionSeconds: 5 });
b.send("ready", true);
await wait(300);
a.send("start");
await wait(5600);
const st = () => a.state as any;
ok(st().phase === "playing", "round playing");
const rt = new MapRuntime(getBuiltinMap(st().mapId)!, st().mapTier);
const me = (r: Room) => st().players.get(r.sessionId);
const [hunter, survivor] = me(a).role === "hunter" ? [a, b] : [b, a];
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

// Survivor hacks the nearest ground-floor terminal.
const sp = me(survivor);
const term = rt.terminals.filter((t) => t.f === 0).sort((t1, t2) => Math.hypot(t1.wx - sp.x, t1.wz - sp.z) - Math.hypot(t2.wx - sp.x, t2.wz - sp.z))[0];
await walk(survivor, term.wx, term.wz, 1.9);
survivor.send("hold", true);
await wait(2500);
const prog = st().terminals.get(term.id).progress;
ok(me(survivor).hacking === term.id && prog > 0.1, `survivor hacking ${term.id} (progress ${prog.toFixed(2)})`);
survivor.send("hold", false);

// Hunter walks to the survivor and swings.
const s2 = me(survivor);
await walk(hunter, s2.x, s2.z, 1.4);
const h = me(hunter);
hunter.send("swing", { ry: Math.atan2(s2.x - h.x, s2.z - h.z) });
await wait(300);
ok(me(survivor).status === "downed", "hunter downed survivor");
hunter.send("hold", true);
await wait(900);
ok(me(survivor).status === "carried" && me(hunter).carrying === survivor.sessionId, "hunter picked up survivor");
hunter.send("hold", false);
const pod = rt.pods.filter((p) => p.f === 0).sort((p1, p2) => Math.hypot(p1.wx - h.x, p1.wz - h.z) - Math.hypot(p2.wx - h.x, p2.wz - h.z))[0];
await walk(hunter, pod.wx, pod.wz, 1.9);
hunter.send("hold", true);
await wait(1400);
ok(me(survivor).status === "podded", `survivor placed in ${pod.id}`);
hunter.send("hold", false);
const end = Date.now() + 70000;
while (st().phase === "playing" && Date.now() < end) await wait(500);
ok(st().phase === "results" && st().winner === "hunters", `round over: ${st().winner} – ${st().resultText}`);
await a.leave();
await b.leave();
console.log("LOOP PASSED");
process.exit(0);
