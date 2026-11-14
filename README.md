# Blackout Protocol

A private, browser-based multiplayer hunt-and-escape game. One or more **Hunters** chase the **Survivors**, who hack terminals to power the exit doors and escape. There are no downloads, no accounts and no public matchmaking: every game is a private room joined by code or invite link.

> Original game. Its gameplay is inspired by the asymmetric "hack and escape" genre, but it uses no third-party code, assets, names or maps.

## Play locally

```bash
npm install
npm run dev:server   # Colyseus game server on :2567
npm run dev:client   # Vite dev server on :5173
```

Open http://localhost:5173 in two browser windows (or on your phone on the same network, at `http://<your-ip>:5173`). Create a room in one window and join it from the other with the code or link.

## Controls

| | Desktop | Mobile |
|---|---|---|
| Move | WASD / arrows | Left thumb joystick |
| Camera | Hold right mouse + drag, wheel to zoom, Ctrl toggles mouse-lock | Drag right side, pinch to zoom |
| Jump / struggle / skill check | Space | Jump button |
| Interact (hack, rescue, open exit, pick up, pod) | Hold E | Hold **Use** |
| Crawl | Hold Shift or toggle C | Crawl toggle |
| Hunter swing | Left click | Tap the right side / **Swing** |
| Ability / powerups | Q, 1–3 | Ability buttons |
| Map / scoreboard / chat | M / Tab / Enter | Map button |

All keys can be rebound in Settings.

## Project layout

- `shared/`: game rules shared by client and server: map format and validator, collision physics, settings schema, powerup registry, avatar schema.
- `server/`: authoritative Colyseus room (private codes, lobby, roles, hacking, captures, rescues, powerups, rounds).
- `client/`: React + three.js / React Three Fiber client.
- `docs/PLAN.md`: architecture and build phases. `docs/HOSTING.md`: hosting research and deploy steps.

## Tests

```bash
npm test                                  # shared: map validation, physics, share codes, settings sanitising
PORT=2599 npx tsx server/src/index.ts &   # then, from server/:
npx tsx test/smoke.ts                     # privacy, settings auth, roles, anti-teleport, host transfer
npx tsx test/loop.ts                      # bots: hack → down → carry → pod → hunters win
npx tsx test/escape.ts                    # bots: hack → exits powered → open → escape → survivors win
```

## Saved data

Your name, avatar and settings live **only in this browser's localStorage**. They don't follow you to other devices, and clearing site data removes them.
