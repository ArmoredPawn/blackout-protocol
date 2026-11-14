import type http from "node:http";

/** Simple per-key token bucket. Memory is bounded by periodic sweeping. */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; at: number }>();
  constructor(
    private capacity: number,
    private refillPerSec: number,
  ) {
    setInterval(() => this.sweep(), 60_000).unref();
  }
  take(key: string, cost = 1): boolean {
    const now = Date.now();
    let b = this.buckets.get(key);
    if (!b) {
      b = { tokens: this.capacity, at: now };
      this.buckets.set(key, b);
    }
    b.tokens = Math.min(this.capacity, b.tokens + ((now - b.at) / 1000) * this.refillPerSec);
    b.at = now;
    if (b.tokens < cost) return false;
    b.tokens -= cost;
    return true;
  }
  private sweep() {
    const now = Date.now();
    for (const [k, b] of this.buckets) if (now - b.at > 10 * 60_000) this.buckets.delete(k);
  }
}

export function clientIp(req: http.IncomingMessage): string {
  // Behind Render/Fly/Cloudflare proxies the left-most X-Forwarded-For entry is the client.
  const xff = req.headers["x-forwarded-for"];
  const first = (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim();
  return first || req.socket.remoteAddress || "unknown";
}

export const limits = {
  create: new RateLimiter(6, 6 / 60), // 6 rooms burst, 6/min
  // Generous enough for a whole class/household on one IP; codes (31^8 ≈ 8.5e11) stay unguessable.
  join: new RateLimiter(40, 30 / 60),
  upgrade: new RateLimiter(60, 2),
  http: new RateLimiter(120, 4),
};

const ALLOWED_METHODS = new Set(["create", "joinById", "reconnect"]);

/**
 * Wrap the HTTP server so requests are filtered BEFORE Colyseus sees them:
 *  - only create / joinById / reconnect matchmaking calls are allowed
 *    (join / joinOrCreate would allow automatic placement → forbidden)
 *  - per-IP rate limits on room creation and join attempts
 */
export function guardHttpServer(server: http.Server, allowedOrigins: string[]) {
  const originOk = (origin: string | undefined) =>
    !origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin);

  const origEmit = server.emit.bind(server);
  server.emit = function (event: string, ...args: any[]): boolean {
    if (event === "request") {
      const [req, res] = args as [http.IncomingMessage, http.ServerResponse];
      const ip = clientIp(req);
      const url = (req.url ?? "").split("?")[0];
      const deny = (status: number, msg: string) => {
        res.writeHead(status, {
          "content-type": "application/json",
          "access-control-allow-origin": req.headers.origin && originOk(req.headers.origin) ? req.headers.origin : "",
        });
        res.end(JSON.stringify({ code: status, error: msg }));
        return true;
      };
      if (req.method !== "OPTIONS" && !limits.http.take(ip)) return deny(429, "Too many requests. Slow down.");
      const m = /^\/matchmake\/([^/]+)\/([^/]+)$/.exec(url);
      if (m && req.method === "POST") {
        if (!originOk(req.headers.origin)) return deny(403, "Origin not allowed");
        const method = m[1];
        if (!ALLOWED_METHODS.has(method)) return deny(403, "Public matchmaking is disabled. Use a private room code.");
        if (method === "create" && !limits.create.take(ip)) return deny(429, "You're creating rooms too quickly. Try again in a minute.");
        if (method === "joinById" && !limits.join.take(ip)) return deny(429, "Too many join attempts. Wait a minute and try again.");
        // Colyseus uses its error numbers as HTTP statuses (e.g. 522 = invalid room id).
        // Proxies like Cloudflare (used by Render) reserve 520–527 and swap in their own
        // error page, which would hide "room not found" from the player. Remap them.
        const writeHead = res.writeHead.bind(res) as (...a: any[]) => http.ServerResponse;
        res.writeHead = ((status: number, ...rest: any[]) =>
          writeHead(status >= 520 && status <= 530 ? (status === 522 ? 404 : 409) : status, ...rest)) as typeof res.writeHead;
      }
    } else if (event === "upgrade") {
      const [req, socket] = args as [http.IncomingMessage, import("node:net").Socket];
      if (!limits.upgrade.take(clientIp(req)) || !originOk(req.headers.origin)) {
        socket.destroy();
        return true;
      }
    }
    return origEmit(event, ...args);
  } as typeof server.emit;
}
