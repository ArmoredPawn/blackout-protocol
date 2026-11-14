import http from "node:http";
import { defineRoom, defineServer, matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ROOM_NAME } from "@bp/shared";
import { GameRoom } from "./GameRoom.js";
import { guardHttpServer } from "./security.js";

const PORT = Number(process.env.PORT ?? 2567);
/** Comma-separated list of allowed browser origins, e.g. "https://play.example.com". "*" allows any. */
const ORIGINS = (process.env.ALLOWED_ORIGINS ?? "*").split(",").map((s) => s.trim()).filter(Boolean);

const httpServer = http.createServer();
guardHttpServer(httpServer, ORIGINS);

matchMaker.controller.getCorsHeaders = (headers: Headers) => {
  const origin = headers.get("origin") ?? "";
  const allow = ORIGINS.includes("*") ? origin || "*" : ORIGINS.includes(origin) ? origin : "";
  return { "Access-Control-Allow-Origin": allow, Vary: "Origin" } as any;
};

const server = defineServer({
  rooms: { [ROOM_NAME]: defineRoom(GameRoom) },
  transport: new WebSocketTransport({ server: httpServer, pingInterval: 6000, maxPayload: 512 * 1024 }),
  greet: false,
  express: (app) => {
    app.get("/health", (_req, res) => {
      res.json({ ok: true, uptime: Math.round(process.uptime()) });
    });
  },
});

server.listen(PORT).then(() => console.log(`[blackout] game server listening on :${PORT} (origins: ${ORIGINS.join(", ")})`));
