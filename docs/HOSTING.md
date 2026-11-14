# Hosting

The game has two independently deployable parts:

| Part | What it is | Where |
|---|---|---|
| `client/` | Static site (Vite build in `client/dist`) | **Cloudflare Pages** (recommended) or Vercel |
| `server/` | Long-running Node process holding WebSocket connections (Colyseus) | **Render** web service (recommended) or Fly.io |

## Why this split

A multiplayer room is a live process: up to 20 players hold an open WebSocket and the server simulates the room at 20 Hz. That rules out serverless platforms (Vercel Functions, Cloudflare Workers/Pages Functions) for the game server, because they're request-scoped. The frontend is plain static files, which any CDN can serve.

## Free-tier reality check (researched November 2026, so re-check before you rely on it)

**Render, free web service**
- Spins down after **15 minutes with no inbound traffic**. The next visitor waits about **1 minute** for a cold start.
- 750 free instance-hours per month per workspace, which is enough for about one always-on service. When they run out, free services are suspended until the next month.
- Render's own docs say free instances aren't meant for production.
- An active match keeps the server awake, because players send movement 20× per second. The problem is the *first* join after an idle period. The client shows a "server may be waking up" message and retries are safe.
- **Verdict:** fine for testing with friends. For reliable play, use **Render Starter (~$7/month)**: always on, no cold starts.

**Fly.io**
- Pay-as-you-go. A `shared-cpu-1x` 256 MB machine is roughly **$2/month** when always on. New accounts no longer get a meaningful free allowance and need a card.
- It can be cheaper than Render Starter and has regions worldwide. The trade-off is more setup (Dockerfile, `fly.toml`).

**Railway** has no lasting free tier: the Hobby plan is $5/month including $5 of usage. **Koyeb** free instances scale to zero when idle, which has the same cold-start problem as Render free.

**Cloudflare Pages (frontend)**
- Static bandwidth is **unmetered** on the free plan. You get 500 builds per month and 20,000 files per site.
- **Recommended for the client.** Vercel's free tier meters bandwidth (~100 GB) and is aimed at non-commercial use.

## Recommendation

1. **Frontend → Cloudflare Pages (free).**
2. **Game server → Render.** Start on *free* while testing. Switch to *Starter* ($7/month) when real groups play, so nobody waits through a cold start. If cost matters more than convenience, Fly.io (~$2–4/month) is the alternative.

## Capacity

One Starter instance (0.5 CPU / 512 MB) comfortably runs several 20-player rooms. Each room ticks at 20 Hz with simple grid collision, and patches are delta-encoded by Colyseus. To scale out, run more instances behind Colyseus' Redis presence/driver. Rooms are fully isolated, so this needs no game-code changes.

## Deploy steps

### Server (Render)
1. Push the repo to GitHub.
2. In Render: **New → Blueprint** and pick the repo. It reads `render.yaml`.
3. Set `ALLOWED_ORIGINS` to your frontend URL, e.g. `https://blackout.pages.dev`.
4. Health check: `GET /health`.

### Client (Cloudflare Pages)
1. **Create project → Connect to Git** and pick the repo.
2. Build command: `npm ci && npm run build --workspace client`
3. Build output directory: `client/dist`
4. Environment variable: `VITE_SERVER_URL=https://<your-render-service>.onrender.com`
5. Node version: set `NODE_VERSION=22`.

Invite links use the URL fragment (`/#/join/CODE`), so no SPA rewrite rules are needed.
