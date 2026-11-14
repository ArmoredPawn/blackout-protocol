# Blackout Protocol: Architecture & Implementation Plan

_Working title. This is an original asymmetric survival game in the "hunt and escape" genre. It does not use any Roblox code, assets, names, maps or characters. The roles are **Hunter** (1–N players) and **Survivors**._

## 1. Gameplay loop

| Phase | What happens | Server state |
|---|---|---|
| Lobby | Players join with the private code, pick an avatar and ready up. The host edits settings. | `phase = "lobby"` |
| Intermission | Short countdown once the host starts (or between rounds). | `phase = "intermission"` |
| Head start | Survivors spawn and the Hunters are frozen for N seconds. | `phase = "headstart"` |
| Round | Survivors hack terminals while Hunters hunt. | `phase = "playing"` |
| Exits powered | The required number of terminals are hacked. Survivors open exit doors (hold E) and escape. | `exitsPowered = true` |
| Results | Shows the winner and each player's outcome, then returns to the lobby. | `phase = "results"` |

**Survivor actions:** hack a terminal (hold E, with timing checks), crawl (Shift/C) through vents and under low obstacles, open exit doors, rescue teammates from stasis pods, struggle free while carried (mash Space), and use powerups.

**Hunter actions:** swing the baton (LMB) to down a Survivor, pick up a downed Survivor (E), carry them to a stasis pod (E), and use the Hunter ability (Q).

**Capture:** A Survivor in a pod loses their capture timer (default 45 s). When it reaches zero they are eliminated and become a spectator. Any free Survivor can hold E at the pod (3 s) to rescue them. A Survivor who is downed and not picked up recovers on their own after a while.

**Win conditions** (all decided by the server):
- Survivors win if **at least one** Survivor escapes. Each player also gets an individual outcome.
- Hunters win if every Survivor is eliminated or captured with no free Survivor left, or if the timer runs out.

## 2. Repository layout (npm workspaces)

```
shared/   Pure TypeScript with no runtime deps beyond zod. It is imported by both client and server.
  constants, settings schema & validation, powerup registry, map format + validator,
  built-in maps, avatar schema + validator, collision/physics, room-code utils
server/   Node + Colyseus 0.18. Server-authoritative game logic.
client/   Vite + React 19 + three.js + @react-three/fiber + drei. UI is React, the game is R3F.
docs/     Plans, hosting notes, map format spec.
```

The shared folder is the main safety mechanism. Movement and collision code, settings validation, map validation and powerup rules are the same code on both sides. The client uses them to predict, and the server uses them to decide.

## 3. Networking model

- **Authority:** The server owns roles, health/status, captures, rescues, terminal progress, doors, powerups, timers, settings and win conditions. Clients send *intents* such as `interact`, `swing`, `ability` and `hackCheck`, and the server decides the outcome.
- **Movement:** Clients predict their own movement locally with the shared physics and send position, velocity and state at 20 Hz. The server **validates** every update and **corrects** the client when needed. It checks the maximum speed for the role, active powerups and crawl state, collision against the map grid, floor/height consistency and teleport attempts. A movement claim the server can't verify is not trusted.
- **Sync:** Colyseus schema state is patched at 20 Hz (50 ms). Only gameplay-relevant fields are synchronized. Animation, footsteps and visual effects are derived on the client. Remote players are rendered with ~100 ms interpolation.
- **Per-room isolation:** Every private room is a separate Colyseus `Room` instance with its own state, settings and timers.

## 4. Privacy model (no public play, by construction)

- Only one room type exists, and **every room calls `setPrivate(true)` in `onCreate`**. Private rooms are skipped by `join`/`joinOrCreate` and hidden from listings, so they can be reached only with `joinById`.
- The room ID **is** the room code: 8 characters from a 31-symbol alphabet with no look-alikes (`ABCDEFGHJKMNPQRSTUVWXYZ23456789`), which gives ≈8.5 × 10¹¹ combinations. Codes are generated with `crypto.randomInt`.
- There is no lobby room, no room-listing endpoint and no quick-play. The client never calls `join`/`joinOrCreate`.
- Per-IP rate limits apply to room creation and join attempts, together with message-rate limits and input validation (zod) on every message.
- Invite link: `https://<site>/#/join/ABCD-EFGH`. The code is in the URL fragment, so it is never sent in HTTP requests or Referer headers.

## 5. Maps

Maps are **tile grids with multiple floors** plus entity lists, in one portable JSON format (`MapDefinition` v1) that is used by the built-in maps, the editor, file import/export and share codes (deflate + base64url).

**Scaling with player count:** A map is authored at its largest size. Areas are tagged with a **tier** (0 = up to 5 players, 1 = 6–10, 2 = 11–15, 3 = 16–20). Gate tiles marked with a tier open into floor or doors only at that tier or above, and each entity has a minimum tier. A 4-player room therefore plays a compact core, while a 20-player room opens every wing with more terminals, pods and exits. The host can also override the tier.

Built-in maps (planned): Research Facility, Industrial Complex, Hillcrest High School, Underground Lab, Galleria Mall, Harbor Warehouse.

The validator checks bounds, size limits, required entities per tier, spawn reachability (BFS) and that every terminal, pod and exit is reachable. This keeps a malformed custom map from crashing the server.

## 6. Controls (modelled on the familiar Flee the Facility layout)

| Action | Desktop | Mobile |
|---|---|---|
| Move | WASD / arrows | Left virtual joystick |
| Camera | Right-mouse-drag to orbit (Roblox-style), wheel to zoom. **Shift-lock** toggle (Ctrl, rebindable) for mouse-look | Drag on the right half of the screen, pinch to zoom |
| Jump | Space | Jump button |
| Interact (hack, rescue, open exit, pick up, pod) | E | Context button (label changes) |
| Crawl | Shift (hold) or C (toggle) | Crawl toggle button |
| Hunter swing | Left mouse | Swing button |
| Hunter ability / Survivor powerup | Q (and 1–3 for slots) | Ability buttons |
| Hacking check | Space or click | Tap the check button |
| Map / scoreboard | M / Tab | Buttons |

All keys can be rebound and are saved in localStorage.

## 7. Powerups (modular registry)

Each powerup is one entry in `shared/src/powerups.ts` with its id, team, name, icon, description, tunables (cooldown, duration, magnitude, charges) and default enabled state. The server implements its effect in one handler file, and the client provides one visual effect component. The host can toggle each powerup and tune its numbers in settings, and the server clamps all values.

Hunter: Adrenaline (speed), Sonar Pulse (reveals Survivors briefly), Heat Vision (sees recent footprints), Lockdown (jams nearest terminals), Phase Step (short dash through a door), Sentinel Trap (snare that roots).
Survivor: Sprint Shot (speed), Terminal Ping (reveals unhacked terminals), Team Link (see teammates through walls), Med Kit (instant recovery from downed), Decoy (fake survivor ping), Smoke Bomb (blocks Hunter vision), Overclock (faster hacking).

## 8. Hosting

See `docs/HOSTING.md`. In short: a **static frontend on Cloudflare Pages** (unmetered static bandwidth) and the **Colyseus server on Render**. The Render free tier is fine for testing, but it sleeps after 15 min idle and takes about 1 min to wake. For a reliable game, use Render Starter ($7/mo, no sleep). The two parts deploy independently, and the client reads `VITE_SERVER_URL`.

## 9. Build phases (each phase leaves the game playable)

1. **Foundation:** monorepo, shared core, private rooms, codes and invite links, lobby with host controls, kick, host transfer and reconnection, settings sync, a basic avatar, one map, validated movement, and the full core loop (hack, down, carry, pod, rescue, exits, timers, results).
2. **Powerups + HUD + audio:** powerup framework with the full set, polished HUD, procedural WebAudio sound effects with spatial audio and volume controls.
3. **Maps:** six themed multi-floor maps with tier scaling, lighting and atmosphere, hiding spots and vents.
4. **Map editor:** block-based editor, preview, local save, file and share-code import/export, custom maps in rooms.
5. **Avatars & animation:** full block-avatar editor (parts, colours, clothing, hair, accessories, face), animation set.
6. **Mobile & polish:** touch controls, responsive UI, graphics quality presets, performance passes, deployment configs.

## 10. Local-only data (no accounts)

Display name, avatar, keybinds, graphics/audio settings and saved custom maps are stored in **this browser's localStorage only**. They do not follow you to another device or browser, and they disappear if site data is cleared. To move an avatar or map, use its export code or file.
