/** 20 bots in one room, all moving at 20 Hz. Reports patch timing + bandwidth seen by one client. */
import { Client, type Room } from "@colyseus/sdk";
import { DEFAULT_AVATAR, ROOM_NAME, MapRuntime, getBuiltinMap, stepBody, JUMP_VELOCITY, BASE_SURVIVOR_SPEED, AF } from "@bp/shared";
const URL = process.env.URL ?? "http://localhost:2567";
const N = Number(process.env.N ?? 20);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const opts = (i: number) => ({ name: `Bot${i}`, avatar: JSON.stringify(DEFAULT_AVATAR), token: `bot${i}`.padEnd(10, "0") });
const rooms: Room[] = [];
rooms.push(await new Client(URL).create(ROOM_NAME, opts(0)));
rooms[0].send("settings", { maxPlayers: 20 });
await wait(300);
for (let i = 1; i < N; i++) {
  rooms.push(await new Client(URL).joinById(rooms[0].roomId, opts(i)));
}
for (const r of rooms) r.onMessage("*", () => {});
const host = rooms[0];
host.send("settings", { maxPlayers: 20, hunterCount: 3, headStartSeconds: 0, mapTier: -1 });
for (const r of rooms.slice(1)) r.send("ready", true);
await wait(500);
host.send("start");
await wait(5500);
const st: any = host.state;
console.log(`phase=${st.phase} players=${st.players.size} tier=${st.mapTier} terminals=${st.terminals.size}`);
// Each bot runs the real client physics, wandering and turning at walls.
const rt = new MapRuntime(getBuiltinMap(st.mapId)!, st.mapTier);
const bodies = rooms.map((r) => {
  const p = st.players.get(r.sessionId);
  return { x: p.x, y: p.y, z: p.z, vy: 0, grounded: true, crawling: false, dir: Math.random() * Math.PI * 2, role: p.role };
});
const corr0 = rooms.map((r) => st.players.get(r.sessionId).corr);
let seq = 1;
const ticker = setInterval(() => {
  rooms.forEach((r, i) => {
    const b = bodies[i];
    const me = st.players.get(r.sessionId);
    if (me.corr !== corr0[i]) {
      // snap like the real client does
      b.x = me.x; b.y = me.y; b.z = me.z; corr0[i] = me.corr; b.dir += Math.PI / 2;
    }
    const px = b.x, pz = b.z;
    const speed = BASE_SURVIVOR_SPEED * (b.role === "hunter" ? 1.07 : 1);
    stepBody(rt, b, { dx: Math.sin(b.dir), dz: Math.cos(b.dir), jump: Math.random() < 0.02, crawl: false, speed: speed * 0.9, jumpVelocity: JUMP_VELOCITY }, 0.05);
    if (Math.hypot(b.x - px, b.z - pz) < speed * 0.05 * 0.3) b.dir += 1 + Math.random() * 2; // blocked → turn
    if (Math.random() < 0.01) b.dir += (Math.random() - 0.5) * 2;
    r.send("move", { x: b.x, y: b.y, z: b.z, ry: b.dir, a: (b.grounded ? AF.grounded : 0) | AF.moving, s: seq });
  });
  seq++;
}, 50);
// Measure patch cadence + bytes at one observer.
const gaps: number[] = [];
let last = 0;
host.onStateChange(() => {
  const now = performance.now();
  if (last) gaps.push(now - last);
  last = now;
});
const ws: any = (host as any).connection?.transport?.ws;
let bytes = 0;
ws?.addEventListener?.("message", (e: any) => (bytes += e.data?.byteLength ?? e.data?.length ?? 0));
await wait(15000);
clearInterval(ticker);
gaps.sort((a, b) => a - b);
const pct = (p: number) => gaps[Math.floor(gaps.length * p)]?.toFixed(1);
console.log(`patches=${gaps.length} in 15s; gap p50=${pct(0.5)}ms p95=${pct(0.95)}ms max=${gaps[gaps.length - 1]?.toFixed(1)}ms`);
console.log(`observer download ≈ ${(bytes / 15 / 1024).toFixed(1)} KB/s`);
const corr = rooms.reduce((s, r, i) => s + st.players.get(r.sessionId).corr, 0);
console.log(`corrections during 15s of physics-driven movement: ${corr - rooms.length} (moves sent: ${(seq - 1) * N})`);
for (const r of rooms) await r.leave();
process.exit(0);
