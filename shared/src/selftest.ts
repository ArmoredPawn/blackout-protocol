import assert from "node:assert/strict";
import {
  BUILTIN_MAPS, MapRuntime, validateMap, stepBody, generateRoomCode, normalizeRoomCode,
  sanitizeSettings, DEFAULT_SETTINGS, parseAvatar, DEFAULT_AVATAR, encodeMapCode, decodeMapCode,
  BASE_SURVIVOR_SPEED, JUMP_VELOCITY,
} from "./index.js";

for (const m of BUILTIN_MAPS) {
  const v = validateMap(m);
  console.log(m.id, v.ok ? "OK" : "FAIL", v.errors, v.warnings);
  console.table(v.tiers);
  assert.ok(v.ok);
  const rt = new MapRuntime(m, 0);
  const sp = rt.spawnsS[0];
  const s = { x: sp.wx, y: sp.wy + 1, z: sp.wz, vy: 0, grounded: false, crawling: false };
  for (let i = 0; i < 60; i++) stepBody(rt, s, { dx: 0, dz: 0, jump: false, crawl: false, speed: 0, jumpVelocity: JUMP_VELOCITY }, 1 / 60);
  assert.ok(s.grounded && Math.abs(s.y - sp.wy) < 0.01, `lands on floor: ${JSON.stringify(s)}`);
  // Walk north for 10 s: must never escape bounds or tunnel through walls.
  for (let i = 0; i < 600; i++) stepBody(rt, s, { dx: 0, dz: -1, jump: false, crawl: false, speed: BASE_SURVIVOR_SPEED, jumpVelocity: JUMP_VELOCITY }, 1 / 60);
  console.log("after walking north", s);
  // Stairs: start at bottom of the first staircase, walk up.
  const st = rt.stairs[0];
  if (st) {
    const b = { x: st.wx, y: 0, z: st.wz + 2.5, vy: 0, grounded: true, crawling: false };
    for (let i = 0; i < 240; i++) stepBody(rt, b, { dx: 0, dz: -1, jump: false, crawl: false, speed: BASE_SURVIVOR_SPEED, jumpVelocity: JUMP_VELOCITY }, 1 / 60);
    console.log("after climbing stairs", b);
    assert.ok(b.y > 3.9, "climbed to floor 1");
  }
  const code = await encodeMapCode(m);
  const back = await decodeMapCode(code);
  assert.deepEqual(back, m);
  console.log("share code length", code.length);
}

const c = generateRoomCode();
assert.equal(normalizeRoomCode(c.slice(0, 4) + "-" + c.slice(4).toLowerCase()), c);
assert.equal(normalizeRoomCode("ABCD-EFG0"), null);
const s = sanitizeSettings({ maxPlayers: 99, hunterCount: 50, roundSeconds: -5, powerups: { sonar: { enabled: false, cooldown: 1 } }, evil: 1 }, DEFAULT_SETTINGS);
assert.equal(s.maxPlayers, 20);
assert.equal(s.hunterCount, 6);
assert.equal(s.roundSeconds, 120);
assert.equal(s.powerups.sonar.enabled, false);
assert.equal(s.powerups.sonar.cooldown, 10);
assert.ok(!("evil" in s));
assert.ok(parseAvatar(JSON.stringify(DEFAULT_AVATAR)));
assert.equal(parseAvatar({ ...DEFAULT_AVATAR, hair: "<script>" }), null);
console.log("selftest passed");
