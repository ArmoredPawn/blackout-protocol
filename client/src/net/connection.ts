import { Client, type Room } from "@colyseus/sdk";
import {
  CLOSE,
  ROOM_NAME,
  formatRoomCode,
  validateMap,
  type ChatMsg,
  type FxEvent,
  type MapDefinition,
  type NoticeMsg,
  type SkillCheckMsg,
} from "@bp/shared";
import { parseSettings, useApp } from "../store";
import type { PlayerSnap, RoomSnap } from "./types";

/** Server URL: VITE_SERVER_URL in production; same host on :2567 in dev. */
export function serverUrl(): string {
  const env = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (env) return env.replace(/\/$/, "");
  return `${location.protocol}//${location.hostname}:2567`;
}

type Listener<T> = (v: T) => void;

class Emitter<T> {
  private ls = new Set<Listener<T>>();
  on(l: Listener<T>) {
    this.ls.add(l);
    return () => {
      this.ls.delete(l);
    };
  }
  emit(v: T) {
    for (const l of this.ls) l(v);
  }
}

export interface InterpSample {
  t: number;
  x: number;
  y: number;
  z: number;
  ry: number;
  anim: number;
}

const RECONNECT_KEY = "bp.reconnect";

/**
 * Owns the Colyseus connection. Game code reads high-frequency data from here
 * directly (no React re-renders); UI receives a throttled snapshot via the store.
 */
class Net {
  client = new Client(serverUrl());
  room: Room | null = null;
  snap: RoomSnap | null = null;
  private snapAt = 0;
  /** Per-player position history for interpolation. */
  buffers = new Map<string, InterpSample[]>();
  fx = new Emitter<FxEvent>();
  roundStart = new Emitter<number>();
  reveals = new Map<string, { until: number; kind: string }>();
  terminalRevealUntil = 0;
  customMap: MapDefinition | null = null;
  customMapRev = 0;
  private lastUiPush = 0;
  private uiTimer: ReturnType<typeof setTimeout> | null = null;
  private leaving = false;

  /** Estimated current server room-clock time (ms). */
  serverNow(): number {
    if (!this.snap) return 0;
    return this.snap.now + (performance.now() - this.snapAt);
  }

  me(): PlayerSnap | undefined {
    return this.room && this.snap ? this.snap.players[this.room.sessionId] : undefined;
  }

  send(type: string, payload?: unknown) {
    try {
      this.room?.send(type as never, payload as never);
    } catch {
      /* socket not open – dropped */
    }
  }

  private joinOptions() {
    const { prefs } = useApp.getState();
    return { name: prefs.name, avatar: JSON.stringify(prefs.avatar), token: prefs.token };
  }

  async createRoom() {
    return this.connect(() => this.client.create(ROOM_NAME, this.joinOptions()));
  }

  async joinRoom(code: string) {
    return this.connect(() => this.client.joinById(code, this.joinOptions()));
  }

  /** Re-join after a page reload within the server's reconnection window. */
  async tryResume(): Promise<boolean> {
    let token: string | null = null;
    try {
      token = sessionStorage.getItem(RECONNECT_KEY);
    } catch {
      /* ignore */
    }
    if (!token) return false;
    try {
      await this.connect(() => this.client.reconnect(token!), true);
      return true;
    } catch {
      this.clearResume();
      return false;
    }
  }

  private clearResume() {
    try {
      sessionStorage.removeItem(RECONNECT_KEY);
    } catch {
      /* ignore */
    }
  }

  private pending: Promise<Room> | null = null;

  /** Serialises connection attempts so double clicks / effects never join twice. */
  private connect(fn: () => Promise<Room>, silent = false): Promise<Room> {
    if (this.pending) return this.pending;
    this.pending = this.doConnect(fn, silent).finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  private async doConnect(fn: () => Promise<Room>, silent = false) {
    const app = useApp.getState();
    if (this.room) await this.leave();
    useApp.setState({ conn: "connecting", error: "" });
    try {
      const room = await fn();
      this.leaving = false;
      this.attach(room);
      useApp.setState({ conn: "connected", screen: "room", myId: room.sessionId });
      history.replaceState(null, "", `#/room/${formatRoomCode(room.roomId)}`);
      return room;
    } catch (e: any) {
      const msg = friendlyError(e);
      useApp.setState({ conn: "error", error: silent ? "" : msg });
      if (!silent) app.toast(msg, "bad");
      throw e;
    }
  }

  private attach(room: Room) {
    this.room = room;
    this.buffers.clear();
    this.reveals.clear();
    try {
      sessionStorage.setItem(RECONNECT_KEY, room.reconnectionToken);
    } catch {
      /* ignore */
    }

    room.onStateChange((state: any) => {
      this.snap = state.toJSON() as RoomSnap;
      this.snapAt = performance.now();
      const t = this.snapAt;
      for (const [id, p] of Object.entries(this.snap.players)) {
        let buf = this.buffers.get(id);
        if (!buf) this.buffers.set(id, (buf = []));
        const last = buf[buf.length - 1];
        if (!last || last.x !== p.x || last.y !== p.y || last.z !== p.z || last.ry !== p.ry || last.anim !== p.anim || t - last.t > 200) {
          buf.push({ t, x: p.x, y: p.y, z: p.z, ry: p.ry, anim: p.anim });
          if (buf.length > 30) buf.splice(0, buf.length - 30);
        }
      }
      for (const id of this.buffers.keys()) if (!this.snap.players[id]) this.buffers.delete(id);
      this.pushUi();
    });

    room.onMessage("notice", (m: NoticeMsg) => useApp.getState().toast(m.text, m.tone));
    room.onMessage("welcome", () => {});
    room.onMessage("round", (m: { round: number }) => this.roundStart.emit(m.round));
    room.onMessage("fx", (e: FxEvent) => this.fx.emit(e));
    room.onMessage("chat", (m: ChatMsg) => {
      useApp.setState((s) => ({
        chat: [...s.chat.slice(-60), { id: Date.now() + Math.random(), name: m.name, text: m.text, self: m.from === room.sessionId }],
      }));
    });
    room.onMessage("skillCheck", (m: SkillCheckMsg) => useApp.setState({ skillCheck: { ...m, receivedAt: performance.now() } }));
    room.onMessage("reveal", (m: { ids: string[]; ms: number; kind: string }) => {
      const until = performance.now() + m.ms;
      for (const id of m.ids) this.reveals.set(id, { until, kind: m.kind });
    });
    room.onMessage("revealTerminals", (m: { ms: number }) => {
      this.terminalRevealUntil = performance.now() + m.ms;
    });
    room.onMessage("customMap", (json: string) => {
      try {
        const v = validateMap(JSON.parse(json));
        if (v.ok && v.map) {
          this.customMap = v.map;
          this.customMapRev++;
        }
      } catch {
        /* ignore malformed */
      }
    });

    room.onDrop(() => useApp.setState({ conn: "reconnecting" }));
    room.onReconnect(() => useApp.setState({ conn: "connected" }));
    room.onLeave((code: number) => {
      const wasLeaving = this.leaving;
      this.room = null;
      this.snap = null;
      this.clearResume();
      useApp.setState({ conn: "idle", snap: null, screen: "home", skillCheck: null, chat: [] });
      history.replaceState(null, "", "#/");
      if (code === CLOSE.kicked) useApp.getState().toast("The host removed you from the room.", "bad");
      else if (!wasLeaving && code !== 1000 && code !== 4000) useApp.getState().toast("Disconnected from the room.", "bad");
    });
  }

  /** UI snapshot at ≤10 Hz to keep React cheap. */
  private pushUi() {
    const now = performance.now();
    const flush = () => {
      this.uiTimer = null;
      this.lastUiPush = performance.now();
      if (!this.snap) return;
      const prev = useApp.getState().snap;
      useApp.setState({
        snap: this.snap,
        settings: prev?.settings === this.snap.settings ? useApp.getState().settings : parseSettings(this.snap.settings),
      });
    };
    if (now - this.lastUiPush > 100) flush();
    else if (!this.uiTimer) this.uiTimer = setTimeout(flush, 100 - (now - this.lastUiPush));
  }

  async leave() {
    this.leaving = true;
    const r = this.room;
    this.room = null;
    this.clearResume();
    if (r) {
      try {
        await r.leave(true);
      } catch {
        /* already closed */
      }
    }
    this.snap = null;
    useApp.setState({ conn: "idle", snap: null, screen: "home", skillCheck: null, chat: [] });
    history.replaceState(null, "", "#/");
  }
}

function friendlyError(e: any): string {
  const msg = String(e?.message ?? e ?? "");
  if (/not found|no rooms found|invalid room/i.test(msg) || e?.code === 4212) return "No room with that code. Check the code and try again.";
  if (/full/i.test(msg)) return "That room is full.";
  if (/removed/i.test(msg)) return "You were removed from that room by the host.";
  if (/locked/i.test(msg)) return "That room isn't accepting players right now.";
  if (/too many|slow down|429/i.test(msg)) return msg;
  if (/fetch|network|ECONN|Failed/i.test(msg))
    return "Can't reach the game server. If it was asleep it may take up to a minute to wake. Try again shortly.";
  return msg || "Something went wrong.";
}

export const net = new Net();
