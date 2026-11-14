import { Client } from "@colyseus/sdk";
import { ROOM_NAME, DEFAULT_AVATAR } from "@bp/shared";

const URL = process.env.URL ?? "http://localhost:2599";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ok = (cond: unknown, msg: string) => {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("ok -", msg);
};

const a = new Client(URL);
const b = new Client(URL);
const opts = (name: string) => ({ name, avatar: JSON.stringify(DEFAULT_AVATAR), token: "tok" + name.toLowerCase().padEnd(8, "x") });

const ra = await a.create(ROOM_NAME, opts("Alice"));
ok(/^[A-Z2-9]{8}$/.test(ra.roomId), `room code ${ra.roomId}`);
const rb = await b.joinById(ra.roomId, opts("Bob"));
await wait(300);
ok((ra.state as any).players.size === 2, "two players in room");
ok((ra.state as any).hostId === ra.sessionId, "creator is host");

let rejected = false;
try { await new Client(URL).joinOrCreate(ROOM_NAME, opts("Eve")); } catch { rejected = true; }
ok(rejected, "joinOrCreate (public matchmaking) rejected");
rejected = false;
try { await new Client(URL).joinById("ZZZZZZZZ", opts("Eve")); } catch { rejected = true; }
ok(rejected, "unknown code rejected");

// Non-host can't change settings
rb.send("settings", { roundSeconds: 999 });
ra.send("settings", { roundSeconds: 300, maxPlayers: 99, hunterCount: 9 });
await wait(300);
const s = JSON.parse((ra.state as any).settings);
ok(s.roundSeconds === 300 && s.maxPlayers === 20 && s.hunterCount === 6, "host settings sanitized & applied, non-host ignored");

ra.send("settings", { headStartSeconds: 0 });
ra.send("start");
await wait(300);
ok((ra.state as any).phase === "lobby", "start blocked until others ready");
rb.send("ready", true);
await wait(200);
ra.send("start");
await wait(5800);
const st: any = ra.state;
ok(st.phase === "headstart" || st.phase === "playing", `round started (${st.phase})`);
const roles = Array.from(st.players.values()).map((p: any) => p.role).sort();
ok(roles.join() === "hunter,survivor", "one hunter, one survivor");
ok(st.terminals.size >= 2 && st.terminalsRequired >= 1, `terminals=${st.terminals.size} required=${st.terminalsRequired}`);
await wait(500);
// Teleport attempt must be corrected.
const survivorRoom = st.players.get(ra.sessionId).role === "survivor" ? ra : rb;
const me: any = (survivorRoom.state as any).players.get(survivorRoom.sessionId);
const corr0 = me.corr, x0 = me.x;
survivorRoom.send("move", { x: me.x + 30, y: me.y, z: me.z, ry: 0, a: 1, s: 1 });
await wait(300);
const me2: any = (survivorRoom.state as any).players.get(survivorRoom.sessionId);
ok(me2.corr > corr0 && Math.abs(me2.x - x0) < 0.01, "teleport rejected & corrected");
survivorRoom.send("move", { x: me.x + 0.2, y: me.y, z: me.z, ry: 0, a: 5, s: 2 });
await wait(300);
ok(Math.abs((survivorRoom.state as any).players.get(survivorRoom.sessionId).x - (x0 + 0.2)) < 0.01, "small legal move accepted");

// Host leaves → host transfers to Bob
await ra.leave();
await wait(500);
ok((rb.state as any).hostId === rb.sessionId, "host transferred on leave");
ok(["results","lobby"].includes((rb.state as any).phase), `round ended when a side emptied (${(rb.state as any).phase})`);
await rb.leave();
console.log("SMOKE PASSED");
process.exit(0);
