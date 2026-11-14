import { Room, ServerError, type Client } from "@colyseus/core";
import {
  AF,
  BUILTIN_MAPS,
  C2S,
  CLOSE,
  DEFAULT_AVATAR,
  DEFAULT_SETTINGS,
  FLOOR_H,
  HUNTER_POWERUPS,
  MAX_NAME_LEN,
  MIN_PLAYERS_TO_START,
  MapRuntime,
  PICKUP_HOLD_SECONDS,
  POD_HOLD_SECONDS,
  POWERUP_MAP,
  PROTECT_SECONDS,
  RANGE,
  SKILL_CHECK_MS,
  STRUGGLE_PER_PRESS,
  SURVIVOR_POWERUPS,
  BASE_HACK_SECONDS,
  effectiveHunterCount,
  encodeEffects,
  generateRoomCode,
  getBuiltinMap,
  groundHeight,
  hasEffect,
  moveSpeed,
  parseAvatar,
  parseEffects,
  positionIsClear,
  sanitizeSettings,
  segmentIsClear,
  terminalsRequiredFor,
  tierForPlayers,
  validateMap,
  type C2SType,
  type FxEvent,
  type MapDefinition,
  type NoticeMsg,
  type RoomSettings,
  type SkillCheckMsg,
} from "@bp/shared";
import type { z } from "zod";
import { ExitState, PickupState, PlayerState, PodState, RoomState, TerminalState, TrapState, ZoneState } from "./schema.js";

interface Auth {
  name: string;
  avatar: string;
  token: string;
}

interface MoveTrack {
  t: number;
  seq: number;
  budget: number;
  strikes: number;
}

interface PendingCheck {
  id: number;
  terminal: string;
  issuedAt: number;
  deadline: number;
}

const RESULTS_MS = 9000;
const FIRST_COUNTDOWN_MS = 5000;

function cleanName(input: unknown): string {
  const s = typeof input === "string" ? input : "";
  // Strip control chars & collapse whitespace; allow letters, numbers, basic punctuation.
  const cleaned = s
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮]/g, "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME_LEN);
  return cleaned || `Player${Math.floor(Math.random() * 900 + 100)}`;
}

export class GameRoom extends Room<{ state: RoomState }> {
  state = new RoomState();
  maxClients = 20;
  patchRate = 50;
  maxMessagesPerSecond = 120;
  autoDispose = true;

  private settings: RoomSettings = sanitizeSettings({}, DEFAULT_SETTINGS);
  private customMap: MapDefinition | null = null;
  private customMapJson = "";
  private rt: MapRuntime | null = null;
  private t0 = Date.now();
  private joinCounter = 0;
  private tokens = new Map<string, string>(); // sessionId → player token
  private bans = new Set<string>();
  private hunterDebt = new Map<string, number>(); // token → rounds since last Hunter
  private moves = new Map<string, MoveTrack>();
  private holds = new Map<string, boolean>();
  private holdTimers = new Map<string, { kind: string; target: string; t: number }>();
  private checks = new Map<string, PendingCheck>();
  private nextCheckAt = new Map<string, number>();
  private checkSeq = 1;
  private lastStruggle = new Map<string, number>();
  private lastChat = new Map<string, number>();
  private podCounts = new Map<string, number>();
  private openExits = 0;
  private nextPickupAt = 0;
  private uid = 0;

  private now() {
    return Date.now() - this.t0;
  }

  // ───────────────────────── lifecycle ─────────────────────────

  async onCreate() {
    this.roomId = generateRoomCode();
    await this.setPrivate(true); // never listed, never auto-joined: only joinById works.
    this.state.code = this.roomId;
    this.applySettings(this.settings);

    const handlers: { [K in C2SType]: (client: Client, msg: z.infer<(typeof C2S)[K]>) => void } = {
      move: (c, m) => this.onMove(c, m),
      ready: (c, m) => this.onReady(c, m),
      settings: (c, m) => this.onSettings(c, m),
      kick: (c, m) => this.onKick(c, m),
      transferHost: (c, m) => this.onTransferHost(c, m),
      start: (c) => this.onStart(c),
      hold: (c, m) => this.holds.set(c.sessionId, m),
      swing: (c, m) => this.onSwing(c, m),
      ability: (c, m) => this.onAbility(c, m.slot),
      check: (c, m) => this.onCheck(c, m),
      struggle: (c) => this.onStruggle(c),
      profile: (c, m) => this.onProfile(c, m),
      chooseAbility: (c, m) => this.onChooseAbility(c, m),
      chat: (c, m) => this.onChat(c, m),
      customMap: (c, m) => this.onCustomMap(c, m),
      returnToLobby: (c) => this.onReturnToLobby(c),
    };
    for (const type of Object.keys(handlers) as C2SType[]) {
      const schema = C2S[type];
      this.onMessage(type, (client: Client, raw: unknown) => {
        const r = schema.safeParse(raw);
        if (!r.success) return; // silently drop malformed input
        try {
          (handlers[type] as (c: Client, m: unknown) => void)(client, r.data);
        } catch (err) {
          console.error(`[room ${this.roomId}] handler ${type} failed`, err);
        }
      });
    }
    this.onMessage("*", () => {}); // unknown types are ignored, not fatal

    this.setTimestep((dt) => this.tick(dt / 1000), 50);
  }

  onAuth(_client: Client, options: any): Auth {
    const token = typeof options?.token === "string" && /^[a-z0-9]{8,64}$/.test(options.token) ? options.token : "";
    if (token && this.bans.has(token)) throw new ServerError(403, "You were removed from this room by the host.");
    if (this.clients.length >= this.settings.maxPlayers) throw new ServerError(403, "This room is full.");
    const avatar = parseAvatar(options?.avatar) ?? DEFAULT_AVATAR;
    return { name: cleanName(options?.name), avatar: JSON.stringify(avatar), token: token || crypto.randomUUID().replace(/-/g, "") };
  }

  onJoin(client: Client, _options: unknown, auth: Auth) {
    const p = new PlayerState();
    p.id = client.sessionId;
    p.name = this.uniqueName(auth.name);
    p.avatar = auth.avatar;
    p.joinOrder = ++this.joinCounter;
    p.ability = HUNTER_POWERUPS.find((h) => this.settings.powerups[h.id]?.enabled)?.id ?? "";
    const inRound = this.state.phase === "headstart" || this.state.phase === "playing" || this.state.phase === "results";
    p.status = inRound ? "spectating" : "lobby";
    this.tokens.set(client.sessionId, auth.token);
    this.state.players.set(client.sessionId, p);
    if (!this.state.hostId) this.state.hostId = client.sessionId;
    if (this.customMapJson) client.send("customMap", this.customMapJson);
    client.send("welcome", { token: auth.token, code: this.roomId });
    this.notice(`${p.name} joined`, "info");
  }

  async onDrop(client: Client) {
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    p.connected = false;
    this.holds.delete(client.sessionId);
    try {
      await this.allowReconnection(client, 45);
    } catch {
      this.removePlayer(client.sessionId, "disconnected");
    }
  }

  onReconnect(client: Client) {
    const p = this.state.players.get(client.sessionId);
    if (p) {
      p.connected = true;
      p.corr++;
      if (this.customMapJson) client.send("customMap", this.customMapJson);
    }
  }

  onLeave(client: Client) {
    this.removePlayer(client.sessionId, "left");
  }

  onDispose() {
    this.tokens.clear();
  }

  // ───────────────────────── helpers ─────────────────────────

  private uniqueName(name: string) {
    const taken = new Set(Array.from(this.state.players.values(), (p) => p.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; i < 99; i++) {
      const n = `${name.slice(0, MAX_NAME_LEN - 3)} ${i}`;
      if (!taken.has(n.toLowerCase())) return n;
    }
    return name;
  }

  private isHost(c: Client) {
    return c.sessionId === this.state.hostId;
  }

  private notice(text: string, tone: NoticeMsg["tone"] = "info", to?: Client) {
    const msg: NoticeMsg = { text, tone };
    if (to) to.send("notice", msg);
    else this.broadcast("notice", msg);
  }

  private fx(e: FxEvent, only?: (p: PlayerState) => boolean) {
    if (!only) return this.broadcast("fx", e);
    for (const c of this.clients) {
      const p = this.state.players.get(c.sessionId);
      if (p && only(p)) c.send("fx", e);
    }
  }

  private clientOf(id: string) {
    return this.clients.getById(id);
  }

  private effectsOf(p: PlayerState) {
    return parseEffects(p.effects);
  }

  private addEffect(p: PlayerState, id: string, seconds: number) {
    const m = this.effectsOf(p);
    m.set(id, this.now() + seconds * 1000);
    p.effects = encodeEffects(m);
  }

  private removeEffect(p: PlayerState, id: string) {
    const m = this.effectsOf(p);
    if (m.delete(id)) p.effects = encodeEffects(m);
  }

  private applySettings(s: RoomSettings) {
    this.settings = s;
    this.state.settings = JSON.stringify(s);
    const def = this.currentMapDef();
    this.state.mapId = def.id === this.customMap?.id && s.mapId === "custom" ? "custom" : def.id;
    this.state.mapName = def.name;
  }

  private currentMapDef(): MapDefinition {
    if (this.settings.mapId === "custom" && this.customMap) return this.customMap;
    return getBuiltinMap(this.settings.mapId) ?? BUILTIN_MAPS[0];
  }

  private dist2(ax: number, az: number, bx: number, bz: number) {
    return (ax - bx) ** 2 + (az - bz) ** 2;
  }

  private near(p: PlayerState, x: number, y: number, z: number, range: number) {
    return Math.abs(p.y - y) < 1.8 && this.dist2(p.x, p.z, x, z) <= range * range;
  }

  private transferHostTo(id: string) {
    this.state.hostId = id;
    const p = this.state.players.get(id);
    if (p) this.notice(`${p.name} is now the host`, "info");
  }

  /** Predictable host transfer: the connected player who joined earliest. */
  private pickNextHost() {
    let best: PlayerState | undefined;
    for (const p of this.state.players.values()) {
      if (!p.connected) continue;
      if (!best || p.joinOrder < best.joinOrder) best = p;
    }
    if (!best) for (const p of this.state.players.values()) if (!best || p.joinOrder < best.joinOrder) best = p;
    this.state.hostId = "";
    if (best) this.transferHostTo(best.id);
  }

  private removePlayer(id: string, why: string) {
    const p = this.state.players.get(id);
    if (!p) return;
    this.releasePlayer(p);
    this.state.players.delete(id);
    this.moves.delete(id);
    this.holds.delete(id);
    this.checks.delete(id);
    this.tokens.delete(id);
    this.notice(`${p.name} ${why === "kicked" ? "was removed" : "left"}`, "info");
    if (this.state.hostId === id) this.pickNextHost();
    if (this.state.phase === "headstart" || this.state.phase === "playing") this.checkRoundEnd();
    if ((this.state.phase === "intermission" || this.state.phase === "results") && this.state.players.size < MIN_PLAYERS_TO_START) {
      this.toLobby();
    }
  }

  /** Detach a player from carry/pod relationships. */
  private releasePlayer(p: PlayerState) {
    if (p.carrying) {
      const v = this.state.players.get(p.carrying);
      if (v) {
        v.status = "downed";
        v.carriedBy = "";
        v.downedEndsAt = this.now() + 4000;
        v.corr++;
      }
      p.carrying = "";
    }
    if (p.carriedBy) {
      const h = this.state.players.get(p.carriedBy);
      if (h) h.carrying = "";
      p.carriedBy = "";
    }
    if (p.pod) {
      const pod = this.state.pods.get(p.pod);
      if (pod) {
        pod.occupant = "";
        pod.rescue = 0;
      }
      p.pod = "";
    }
    if (p.hacking) p.hacking = "";
  }

  // ───────────────────────── lobby messages ─────────────────────────

  private onProfile(c: Client, m: { name: string; avatar: string }) {
    const p = this.state.players.get(c.sessionId);
    if (!p || this.state.phase === "playing" || this.state.phase === "headstart") return;
    const name = cleanName(m.name);
    if (name !== p.name) p.name = this.uniqueName(name);
    const av = parseAvatar(m.avatar);
    if (av) p.avatar = JSON.stringify(av);
  }

  private onReady(c: Client, ready: boolean) {
    const p = this.state.players.get(c.sessionId);
    if (p && this.state.phase === "lobby") p.ready = ready;
  }

  private canEditSettings() {
    return this.state.phase === "lobby" || this.state.phase === "intermission";
  }

  private onSettings(c: Client, patch: Record<string, unknown>) {
    if (!this.isHost(c) || !this.canEditSettings()) return;
    const next = sanitizeSettings(patch, this.settings);
    if (next.mapId !== "custom" && !getBuiltinMap(next.mapId)) next.mapId = this.settings.mapId;
    if (next.mapId === "custom" && !this.customMap) next.mapId = this.settings.mapId;
    // Max players can't drop below the number already in the room.
    next.maxPlayers = Math.max(next.maxPlayers, this.state.players.size, 2);
    next.hunterCount = Math.min(next.hunterCount, next.maxPlayers - 1);
    this.applySettings(next);
  }

  private onCustomMap(c: Client, json: string) {
    if (!this.isHost(c) || !this.canEditSettings()) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      return this.notice("That map file couldn't be read.", "bad", c);
    }
    const v = validateMap(parsed);
    if (!v.ok || !v.map) return this.notice(`Map rejected: ${v.errors[0] ?? "invalid"}`, "bad", c);
    this.customMap = { ...v.map, id: "custom" };
    this.customMapJson = JSON.stringify(this.customMap);
    this.state.mapRev++;
    this.broadcast("customMap", this.customMapJson);
    this.applySettings({ ...this.settings, mapId: "custom" });
    this.notice(`Custom map "${v.map.name}" loaded`, "good");
  }

  private onKick(c: Client, id: string) {
    if (!this.isHost(c) || id === c.sessionId) return;
    const target = this.clientOf(id);
    const token = this.tokens.get(id);
    if (token) this.bans.add(token);
    if (target) target.leave(CLOSE.kicked);
    this.removePlayer(id, "kicked");
  }

  private onTransferHost(c: Client, id: string) {
    if (!this.isHost(c) || !this.state.players.has(id) || id === c.sessionId) return;
    this.transferHostTo(id);
  }

  private onChooseAbility(c: Client, id: string) {
    const p = this.state.players.get(c.sessionId);
    const def = POWERUP_MAP[id];
    if (!p || !def || def.team !== "hunter" || !this.settings.powerups[id]?.enabled) return;
    if (this.state.phase === "playing" || this.state.phase === "headstart") return;
    p.ability = id;
  }

  private onChat(c: Client, text: string) {
    const now = Date.now();
    if (now - (this.lastChat.get(c.sessionId) ?? 0) < 700) return;
    this.lastChat.set(c.sessionId, now);
    const p = this.state.players.get(c.sessionId);
    const clean = text.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 160);
    if (!p || !clean) return;
    this.broadcast("chat", { from: p.id, name: p.name, text: clean });
  }

  private onStart(c: Client) {
    if (!this.isHost(c) || this.state.phase !== "lobby") return;
    const players = Array.from(this.state.players.values()).filter((p) => p.connected);
    if (players.length < MIN_PLAYERS_TO_START) return this.notice("You need at least 2 players to start.", "warn", c);
    const notReady = players.filter((p) => !p.ready && p.id !== this.state.hostId);
    if (notReady.length) {
      return this.notice(`Waiting for ${notReady.map((p) => p.name).join(", ")} to ready up.`, "warn", c);
    }
    this.state.phase = "intermission";
    this.state.phaseEndsAt = this.now() + FIRST_COUNTDOWN_MS;
  }

  private onReturnToLobby(c: Client) {
    if (!this.isHost(c)) return;
    if (this.state.phase === "results" || this.state.phase === "intermission") this.toLobby();
  }

  private toLobby() {
    this.state.phase = "lobby";
    this.state.phaseEndsAt = 0;
    for (const p of this.state.players.values()) {
      this.releasePlayer(p);
      p.status = "lobby";
      p.role = "none";
      p.ready = false;
      p.effects = "";
      p.slots.clear();
    }
  }

  // ───────────────────────── round setup ─────────────────────────

  private setupRound() {
    const players = Array.from(this.state.players.values()).filter((p) => p.connected);
    if (players.length < MIN_PLAYERS_TO_START) return this.toLobby();
    const tier = this.settings.mapTier >= 0 ? this.settings.mapTier : tierForPlayers(players.length);
    const def = this.currentMapDef();
    const rt = new MapRuntime(def, tier);
    this.rt = rt;
    this.openExits = 0;
    this.state.round++;
    this.state.mapId = this.settings.mapId === "custom" ? "custom" : def.id;
    this.state.mapName = def.name;
    this.state.mapTier = tier;
    this.state.winner = "";
    this.state.resultText = "";
    this.state.exitsPowered = false;
    this.state.terminalsHacked = 0;

    // Roles: weighted toward players who haven't been Hunter recently.
    const hunterN = effectiveHunterCount(this.settings, players.length);
    const pool = players.map((p) => ({ p, w: 1 + (this.hunterDebt.get(this.tokens.get(p.id) ?? p.id) ?? 0) ** 2 }));
    const hunters = new Set<string>();
    while (hunters.size < hunterN && pool.length) {
      const total = pool.reduce((s, e) => s + e.w, 0);
      let r = Math.random() * total;
      const idx = pool.findIndex((e) => (r -= e.w) <= 0);
      const [pick] = pool.splice(idx < 0 ? 0 : idx, 1);
      hunters.add(pick.p.id);
    }
    const enabledHunterAbilities = HUNTER_POWERUPS.filter((h) => this.settings.powerups[h.id]?.enabled).map((h) => h.id);

    // Reset per-round state.
    this.state.terminals.clear();
    this.state.pods.clear();
    this.state.exits.clear();
    this.state.pickups.clear();
    this.state.traps.clear();
    this.state.zones.clear();
    this.holds.clear();
    this.holdTimers.clear();
    this.checks.clear();
    this.nextCheckAt.clear();
    this.podCounts.clear();
    for (const t of rt.terminals) this.state.terminals.set(t.id, new TerminalState());
    for (const p of rt.pods) this.state.pods.set(p.id, new PodState());
    for (const e of rt.exits) this.state.exits.set(e.id, new ExitState());

    const survivors = players.filter((p) => !hunters.has(p.id));
    this.state.terminalsRequired = terminalsRequiredFor(this.settings, survivors.length, rt.terminals.length);

    for (const p of this.state.players.values()) {
      p.carrying = p.carriedBy = p.pod = p.hacking = "";
      p.effects = "";
      p.struggle = 0;
      p.slots.clear();
      p.statHacks = p.statRescues = p.statCaptures = p.statHits = 0;
      if (!p.connected) {
        p.role = "none";
        p.status = "spectating";
        continue;
      }
      const isHunter = hunters.has(p.id);
      p.role = isHunter ? "hunter" : "survivor";
      p.status = "free";
      p.ready = false;
      const key = this.tokens.get(p.id) ?? p.id;
      this.hunterDebt.set(key, isHunter ? 0 : (this.hunterDebt.get(key) ?? 0) + 1);
      if (isHunter) {
        if (!this.settings.hunterAbilitiesEnabled || enabledHunterAbilities.length === 0) p.ability = "";
        else if (this.settings.hunterAbilityMode === "random" || !enabledHunterAbilities.includes(p.ability))
          p.ability = enabledHunterAbilities[Math.floor(Math.random() * enabledHunterAbilities.length)];
        p.abilityReadyAt = 0;
        p.swingReadyAt = 0;
      }
    }
    this.placeAtSpawns(survivors, rt.spawnsS);
    this.placeAtSpawns(
      players.filter((p) => hunters.has(p.id)),
      rt.spawnsH.length ? rt.spawnsH : rt.spawnsS,
    );

    this.nextPickupAt = this.now() + 8000;
    this.state.phase = "headstart";
    this.state.phaseEndsAt = this.now() + this.settings.headStartSeconds * 1000;
    this.broadcast("round", { round: this.state.round });
  }

  private placeAtSpawns(list: PlayerState[], spawns: { wx: number; wy: number; wz: number }[]) {
    const rt = this.rt!;
    list.forEach((p, i) => {
      const sp = spawns[i % spawns.length];
      const ring = Math.floor(i / spawns.length);
      const ang = (i * 2.399963) % (Math.PI * 2);
      const rad = ring === 0 && list.length <= spawns.length ? 0 : 0.9 + (ring % 3) * 0.7;
      let x = sp.wx + Math.cos(ang) * rad;
      let z = sp.wz + Math.sin(ang) * rad;
      if (!positionIsClear(rt, x, sp.wy, z, false)) {
        x = sp.wx;
        z = sp.wz;
      }
      p.x = x;
      p.y = sp.wy;
      p.z = z;
      p.ry = Math.random() * Math.PI * 2;
      p.anim = AF.grounded;
      p.corr++;
      this.moves.set(p.id, { t: this.now(), seq: 0, budget: 0, strikes: 0 });
    });
  }

  // ───────────────────────── movement ─────────────────────────

  private onMove(c: Client, m: { x: number; y: number; z: number; ry: number; a: number; s: number }) {
    const p = this.state.players.get(c.sessionId);
    const rt = this.rt;
    if (!p || !rt) return;
    if (this.state.phase !== "playing" && this.state.phase !== "headstart") return;
    if (p.status !== "free" && p.status !== "downed") return;
    const now = this.now();
    const track = this.moves.get(p.id) ?? { t: now, seq: 0, budget: 0, strikes: 0 };
    if (m.s <= track.seq) return; // stale / replayed packet
    // Frozen during head start.
    if (p.role === "hunter" && this.state.phase === "headstart") {
      if (this.dist2(p.x, p.z, m.x, m.z) > 0.25) p.corr++;
      track.seq = m.s;
      this.moves.set(p.id, track);
      p.ry = m.ry;
      return;
    }

    const elapsed = Math.min(1, Math.max(0, (now - track.t) / 1000));
    track.t = now;
    track.seq = m.s;
    const crawling = (m.a & AF.crawling) !== 0;
    const effects = this.effectsOf(p);
    const speed = Math.max(
      moveSpeed(p.role, p.status, crawling, effects, now, this.settings, !!p.carrying),
      moveSpeed(p.role, p.status, false, effects, now, this.settings, !!p.carrying),
    );
    // Distance budget tolerates bursty packets and jitter but not speed hacks.
    track.budget = Math.min(speed * 1.2 + 1, track.budget + speed * elapsed * 1.25 + 0.05);
    const d = Math.hypot(m.x - p.x, m.z - p.z);
    let ok = d <= track.budget;
    // No flying: must be within jump reach of some ground below.
    const g = groundHeight(rt, m.x, m.y, m.z, this.openExits);
    if (m.y - g > 2.4 && m.y > p.y + 0.05) ok = false;
    if (m.y < -5 || m.y > rt.floorCount * FLOOR_H + 2) ok = false;
    if (ok && !positionIsClear(rt, m.x, m.y, m.z, crawling, this.openExits)) ok = false;
    if (ok && d > 0.05 && !segmentIsClear(rt, p.x, p.y, p.z, m.x, m.y, m.z, crawling, this.openExits)) ok = false;

    if (ok) {
      track.budget -= d;
      track.strikes = Math.max(0, track.strikes - 1);
      p.x = m.x;
      p.y = m.y;
      p.z = m.z;
      p.ry = m.ry;
      p.anim = m.a;
    } else {
      track.strikes++;
      track.budget = 0;
      p.corr++; // client snaps back to authoritative position
      p.ry = m.ry;
    }
    this.moves.set(p.id, track);
  }

  // ───────────────────────── combat ─────────────────────────

  private onSwing(c: Client, m: { ry: number }) {
    const h = this.state.players.get(c.sessionId);
    if (!h || h.role !== "hunter" || this.state.phase !== "playing" || h.status !== "free") return;
    const now = this.now();
    if (now < h.swingReadyAt || hasEffect(this.effectsOf(h), "stunned", now)) return;
    h.swingReadyAt = now + this.settings.swingCooldown * 1000;
    h.ry = m.ry;
    this.fx({ kind: "swing", id: h.id });
    if (h.carrying) return;
    const rt = this.rt!;
    const fx = Math.sin(m.ry),
      fz = Math.cos(m.ry);
    // Decoys absorb hits.
    for (const [zid, zn] of this.state.zones) {
      if (zn.kind !== "decoy") continue;
      const dx = zn.x - h.x,
        dz = zn.z - h.z;
      if (dx * dx + dz * dz < RANGE.swing ** 2 && Math.abs(zn.y - h.y) < 1.6) {
        this.state.zones.delete(zid);
        this.fx({ kind: "blocked", id: h.id, x: zn.x, y: zn.y, z: zn.z, ref: "decoy" });
        return;
      }
    }
    let best: PlayerState | undefined;
    let bestD = Infinity;
    for (const s of this.state.players.values()) {
      if (s.role !== "survivor" || s.status !== "free") continue;
      const dx = s.x - h.x,
        dz = s.z - h.z;
      const dd = Math.hypot(dx, dz);
      if (dd > RANGE.swing || Math.abs(s.y - h.y) > 1.6) continue;
      // Within a 75° half-cone in front (or touching).
      const dot = dd > 0.01 ? (dx * fx + dz * fz) / dd : 1;
      if (dd > 1.1 && dot < Math.cos((75 * Math.PI) / 180)) continue;
      if (!rt.lineOfSight(h.x, h.y + 1.2, h.z, s.x, s.y + 1, s.z, this.openExits)) continue;
      if (dd < bestD) {
        bestD = dd;
        best = s;
      }
    }
    if (!best) return;
    const eff = this.effectsOf(best);
    if (hasEffect(eff, "protected", now)) return;
    if (hasEffect(eff, "shield", now)) {
      this.removeEffect(best, "shield");
      this.addEffect(best, "sprint", 2);
      this.fx({ kind: "blocked", id: h.id, target: best.id, x: best.x, y: best.y, z: best.z });
      return;
    }
    this.downSurvivor(best, h);
  }

  private downSurvivor(s: PlayerState, h: PlayerState) {
    this.stopHacking(s);
    s.status = "downed";
    s.downedEndsAt = this.now() + this.settings.downedRecoverSeconds * 1000;
    s.struggle = 0;
    h.statHits++;
    this.fx({ kind: "down", id: h.id, target: s.id, x: s.x, y: s.y, z: s.z });
  }

  private stopHacking(p: PlayerState) {
    if (p.hacking) p.hacking = "";
    this.checks.delete(p.id);
  }

  private onStruggle(c: Client) {
    const s = this.state.players.get(c.sessionId);
    if (!s || s.status !== "carried" || !this.settings.struggleEnabled) return;
    const now = Date.now();
    if (now - (this.lastStruggle.get(s.id) ?? 0) < 70) return; // ≤ ~14 presses/s count
    this.lastStruggle.set(s.id, now);
    s.struggle = Math.min(1, s.struggle + STRUGGLE_PER_PRESS);
    if (s.struggle >= 1) {
      const h = this.state.players.get(s.carriedBy);
      if (h) {
        h.carrying = "";
        this.addEffect(h, "stunned", 1.6);
      }
      s.carriedBy = "";
      s.status = "free";
      s.struggle = 0;
      s.corr++;
      this.addEffect(s, "protected", 2);
      this.fx({ kind: "struggleFree", id: s.id, target: h?.id, x: s.x, y: s.y, z: s.z });
    }
  }

  private onCheck(c: Client, m: { id: number; hit: boolean }) {
    const pending = this.checks.get(c.sessionId);
    if (!pending || pending.id !== m.id) return;
    this.checks.delete(c.sessionId);
    const late = this.now() > pending.deadline;
    if (!m.hit || late) this.failCheck(c.sessionId, pending.terminal);
  }

  private failCheck(id: string, terminalId: string) {
    const t = this.state.terminals.get(terminalId);
    const term = this.rt?.terminals.find((x) => x.id === terminalId);
    if (!t || !term || t.hacked) return;
    t.progress = Math.max(0, t.progress - 0.04);
    t.alarmAt = this.now();
    // Hunters hear the alarm (with location); survivors see the terminal flash.
    this.fx({ kind: "alarm", id, ref: terminalId, x: term.wx, y: term.wy, z: term.wz });
  }

  // ───────────────────────── abilities ─────────────────────────

  private onAbility(c: Client, slot: number) {
    const p = this.state.players.get(c.sessionId);
    if (!p || this.state.phase !== "playing") return;
    const now = this.now();
    if (p.role === "hunter") {
      if (slot !== -1 || !p.ability || !this.settings.hunterAbilitiesEnabled) return;
      const tune = this.settings.powerups[p.ability];
      if (!tune?.enabled || now < p.abilityReadyAt || p.status !== "free") return;
      p.abilityReadyAt = now + (tune.cooldown ?? 30) * 1000;
      this.hunterAbility(p, p.ability, tune.duration ?? 5, tune.magnitude ?? 1);
      this.fx({ kind: "ability", id: p.id, ability: p.ability, x: p.x, y: p.y, z: p.z });
      return;
    }
    if (p.role !== "survivor" || slot < 0 || slot >= p.slots.length) return;
    const id = p.slots[slot];
    const tune = this.settings.powerups[id];
    if (!id || !tune?.enabled) return;
    if (p.status !== "free" && !(p.status === "downed" && id === "shield")) return;
    p.slots.splice(slot, 1);
    this.survivorPowerup(p, id, tune.duration ?? 8, tune.magnitude ?? 1);
    this.fx({ kind: "ability", id: p.id, ability: id, x: p.x, y: p.y, z: p.z });
  }

  private revealTo(viewers: PlayerState[], targets: string[], seconds: number, kind: string) {
    for (const v of viewers) this.clientOf(v.id)?.send("reveal", { ids: targets, ms: seconds * 1000, kind });
  }

  private isConcealed(s: PlayerState, now: number) {
    if (hasEffect(this.effectsOf(s), "ghost", now)) return true;
    for (const z of this.state.zones.values()) {
      if (z.kind === "smoke" && (s.x - z.x) ** 2 + (s.z - z.z) ** 2 < z.radius ** 2) return true;
    }
    return false;
  }

  private hunterAbility(h: PlayerState, id: string, duration: number, magnitude: number) {
    const now = this.now();
    const survivors = Array.from(this.state.players.values()).filter(
      (s) => s.role === "survivor" && (s.status === "free" || s.status === "downed"),
    );
    switch (id) {
      case "adrenaline":
        this.addEffect(h, "adrenaline", duration);
        break;
      case "lunge":
        this.addEffect(h, "lunge", duration);
        break;
      case "sonar": {
        const hits = survivors.filter((s) => !this.isConcealed(s, now) && this.dist2(s.x, s.z, h.x, h.z) < magnitude ** 2);
        this.revealTo([h], hits.map((s) => s.id), duration, "sonar");
        for (const s of hits) this.notice("A sonar pulse revealed your position!", "warn", this.clientOf(s.id));
        break;
      }
      case "tracker": {
        let best: PlayerState | undefined;
        for (const s of survivors) {
          if (this.isConcealed(s, now)) continue;
          if (!best || this.dist2(s.x, s.z, h.x, h.z) < this.dist2(best.x, best.z, h.x, h.z)) best = s;
        }
        if (best) {
          this.revealTo([h], [best.id], duration, "tracker");
          this.notice("You're being hunted. Bloodhound is tracking you!", "warn", this.clientOf(best.id));
        }
        break;
      }
      case "lockdown": {
        for (const t of this.rt!.terminals) {
          const st = this.state.terminals.get(t.id);
          if (!st || st.hacked) continue;
          if (this.dist2(t.wx, t.wz, h.x, h.z) < magnitude ** 2) st.jammedUntil = now + duration * 1000;
        }
        break;
      }
      case "snare": {
        const mine = Array.from(this.state.traps).filter(([, t]) => t.owner === h.id);
        while (mine.length >= Math.max(1, Math.round(magnitude))) this.state.traps.delete(mine.shift()![0]);
        const t = new TrapState();
        t.owner = h.id;
        t.x = h.x;
        t.y = h.y;
        t.z = h.z;
        this.state.traps.set(`trap${++this.uid}`, t);
        break;
      }
    }
  }

  private survivorPowerup(p: PlayerState, id: string, duration: number, magnitude: number) {
    const now = this.now();
    const team = Array.from(this.state.players.values()).filter((s) => s.role === "survivor");
    switch (id) {
      case "sprint":
        this.addEffect(p, "sprint", duration);
        break;
      case "overclock":
        this.addEffect(p, "overclock", duration);
        break;
      case "ghostStep":
        this.addEffect(p, "ghost", duration);
        break;
      case "shield":
        if (p.status === "downed") {
          p.status = "free";
          p.downedEndsAt = 0;
          this.addEffect(p, "protected", 2);
          this.fx({ kind: "recover", id: p.id, x: p.x, y: p.y, z: p.z });
        } else this.addEffect(p, "shield", duration);
        break;
      case "terminalPing":
        for (const s of team) this.clientOf(s.id)?.send("revealTerminals", { ms: duration * 1000 });
        this.notice(`${p.name} scanned the network: terminals revealed`, "good");
        break;
      case "teamLink":
        this.revealTo(team, team.map((s) => s.id), duration, "team");
        break;
      case "smoke": {
        const z = new ZoneState();
        z.kind = "smoke";
        z.owner = p.id;
        z.x = p.x;
        z.y = p.y;
        z.z = p.z;
        z.radius = magnitude;
        z.endsAt = now + duration * 1000;
        this.state.zones.set(`zone${++this.uid}`, z);
        break;
      }
      case "decoy": {
        const z = new ZoneState();
        z.kind = "decoy";
        z.owner = p.id;
        z.x = p.x;
        z.y = p.y;
        z.z = p.z;
        z.ry = p.ry;
        z.radius = 0.5;
        z.endsAt = now + duration * 1000;
        this.state.zones.set(`zone${++this.uid}`, z);
        break;
      }
    }
  }

  // ───────────────────────── tick ─────────────────────────

  private tick(dt: number) {
    const now = this.now();
    this.state.now = now;
    const ph = this.state.phase;
    if (ph === "intermission" && now >= this.state.phaseEndsAt) return this.setupRound();
    if (ph === "headstart" && now >= this.state.phaseEndsAt) {
      this.state.phase = "playing";
      this.state.phaseEndsAt = now + this.settings.roundSeconds * 1000;
      this.broadcast("notice", { text: "The Hunter is loose!", tone: "bad" } satisfies NoticeMsg);
    }
    if (ph === "results" && now >= this.state.phaseEndsAt) {
      const connected = Array.from(this.state.players.values()).filter((p) => p.connected).length;
      if (connected >= MIN_PLAYERS_TO_START) {
        this.toLobbyPose();
        this.state.phase = "intermission";
        this.state.phaseEndsAt = now + this.settings.intermissionSeconds * 1000;
      } else this.toLobby();
      return;
    }
    if (ph !== "playing" && ph !== "headstart") return;
    if (ph === "playing" && now >= this.state.phaseEndsAt) return this.endRound("time");

    this.tickEffects(now);
    this.tickPlayers(now, dt);
    if (ph === "playing") {
      this.tickHolds(now, dt);
      this.tickTerminals(now, dt);
      this.tickPickups(now);
      this.tickTraps(now);
      this.tickZones(now, dt);
      this.checkRoundEnd();
    }
  }

  /** Between rounds: everyone becomes a lobby participant again (keeps ready=false). */
  private toLobbyPose() {
    for (const p of this.state.players.values()) {
      this.releasePlayer(p);
      p.status = "lobby";
      p.role = "none";
      p.effects = "";
      p.slots.clear();
    }
  }

  private tickEffects(now: number) {
    for (const p of this.state.players.values()) {
      if (!p.effects) continue;
      const m = this.effectsOf(p);
      let changed = false;
      for (const [id, t] of m) if (t <= now) (m.delete(id), (changed = true));
      if (changed) p.effects = encodeEffects(m);
    }
  }

  private tickPlayers(now: number, dt: number) {
    let allTrapped = true;
    let anySurvivor = false;
    for (const p of this.state.players.values()) {
      if (p.role !== "survivor") continue;
      if (p.status === "free" || p.status === "downed") allTrapped = false;
      if (p.status === "free" || p.status === "downed" || p.status === "carried" || p.status === "podded") anySurvivor = true;
    }
    const podRate = allTrapped && anySurvivor ? 3 : 1;

    for (const p of this.state.players.values()) {
      if (p.status === "downed" && now >= p.downedEndsAt) {
        p.status = "free";
        this.addEffect(p, "protected", 1.5);
        this.fx({ kind: "recover", id: p.id, x: p.x, y: p.y, z: p.z });
      }
      if (p.status === "carried") {
        const h = this.state.players.get(p.carriedBy);
        if (!h) {
          p.status = "downed";
          p.carriedBy = "";
          p.downedEndsAt = now + 3000;
          continue;
        }
        p.x = h.x;
        p.y = h.y;
        p.z = h.z;
        p.ry = h.ry;
        if (p.struggle > 0) p.struggle = Math.max(0, p.struggle - dt * 0.05);
      }
      if (p.status === "podded") {
        p.podEndsAt -= (podRate - 1) * dt * 1000; // drains faster when nobody can help
        if (now >= p.podEndsAt) this.eliminate(p);
      }
    }
  }

  private eliminate(p: PlayerState) {
    const pod = this.state.pods.get(p.pod);
    if (pod) {
      pod.occupant = "";
      pod.rescue = 0;
    }
    p.pod = "";
    p.status = "eliminated";
    this.fx({ kind: "eliminated", id: p.id, x: p.x, y: p.y, z: p.z });
    this.notice(`${p.name} was eliminated`, "bad");
  }

  private tickHolds(now: number, dt: number) {
    const rt = this.rt!;
    for (const p of this.state.players.values()) {
      const holding = this.holds.get(p.id) === true && p.connected;
      const eff = this.effectsOf(p);
      const blocked = hasEffect(eff, "stunned", now) || hasEffect(eff, "rooted", now);
      if (p.role === "hunter") {
        const timer = this.holdTimers.get(p.id);
        if (!holding || blocked || p.status !== "free") {
          this.holdTimers.delete(p.id);
          continue;
        }
        if (p.carrying) {
          // Put the carried survivor into the nearest empty pod.
          let target = "";
          for (const pod of rt.pods) {
            const st = this.state.pods.get(pod.id);
            if (st && !st.occupant && this.near(p, pod.wx, pod.wy, pod.wz, RANGE.pod)) target = pod.id;
          }
          if (!target) {
            this.holdTimers.delete(p.id);
            continue;
          }
          const t = timer && timer.kind === "pod" && timer.target === target ? timer : { kind: "pod", target, t: 0 };
          t.t += dt;
          this.holdTimers.set(p.id, t);
          if (t.t >= POD_HOLD_SECONDS) {
            this.holdTimers.delete(p.id);
            this.podSurvivor(p, target);
          }
        } else {
          let target: PlayerState | undefined;
          for (const s of this.state.players.values()) {
            if (s.status === "downed" && this.near(p, s.x, s.y, s.z, RANGE.downed)) target = s;
          }
          if (!target) {
            this.holdTimers.delete(p.id);
            continue;
          }
          const t = timer && timer.kind === "pickup" && timer.target === target.id ? timer : { kind: "pickup", target: target.id, t: 0 };
          t.t += dt;
          this.holdTimers.set(p.id, t);
          if (t.t >= PICKUP_HOLD_SECONDS) {
            this.holdTimers.delete(p.id);
            target.status = "carried";
            target.carriedBy = p.id;
            target.struggle = 0;
            p.carrying = target.id;
            this.fx({ kind: "pickup", id: p.id, target: target.id });
          }
        }
        continue;
      }

      // Survivors
      if (p.role !== "survivor") continue;
      if (!holding || blocked || p.status !== "free") {
        this.stopHacking(p);
        continue;
      }
      // 1) Rescue a podded teammate.
      let acted = false;
      for (const pod of rt.pods) {
        const st = this.state.pods.get(pod.id);
        if (!st?.occupant || !this.near(p, pod.wx, pod.wy, pod.wz, RANGE.rescue)) continue;
        this.stopHacking(p);
        st.rescue += dt / this.settings.rescueSeconds;
        acted = true;
        if (st.rescue >= 1) this.rescue(pod.id, p);
        break;
      }
      if (acted) continue;
      // 2) Open an exit door.
      if (this.state.exitsPowered) {
        for (const ex of rt.exits) {
          const st = this.state.exits.get(ex.id);
          if (!st || st.open || !this.near(p, ex.ix, ex.wy, ex.iz, RANGE.exit)) continue;
          this.stopHacking(p);
          st.progress = Math.min(1, st.progress + dt / this.settings.exitOpenSeconds);
          acted = true;
          if (st.progress >= 1) {
            st.open = true;
            this.openExits |= 1 << ex.index;
            this.fx({ kind: "exitOpen", ref: ex.id, x: ex.wx, y: ex.wy, z: ex.wz });
            this.notice("An exit door is open! Run!", "good");
          }
          break;
        }
        if (acted) continue;
      }
      // 3) Hack the nearest terminal.
      let best = "";
      let bestD = Infinity;
      for (const t of rt.terminals) {
        const st = this.state.terminals.get(t.id);
        if (!st || st.hacked || st.jammedUntil > now) continue;
        const d2 = this.dist2(p.x, p.z, t.wx, t.wz);
        if (d2 < bestD && this.near(p, t.wx, t.wy, t.wz, RANGE.terminal)) {
          bestD = d2;
          best = t.id;
        }
      }
      if (best !== p.hacking) {
        this.stopHacking(p);
        p.hacking = best;
        if (best) this.nextCheckAt.set(p.id, now + 2500 + Math.random() * 4000);
      }
    }
  }

  private podSurvivor(h: PlayerState, podId: string) {
    const s = this.state.players.get(h.carrying);
    const pod = this.state.pods.get(podId);
    const placed = this.rt!.pods.find((x) => x.id === podId);
    if (!s || !pod || !placed) return;
    h.carrying = "";
    s.carriedBy = "";
    s.status = "podded";
    s.pod = podId;
    const n = (this.podCounts.get(s.id) ?? 0) + 1;
    this.podCounts.set(s.id, n);
    // Second and later captures drain faster.
    s.podEndsAt = this.now() + this.settings.captureSeconds * 1000 * (n === 1 ? 1 : n === 2 ? 0.6 : 0.3);
    s.x = placed.wx;
    s.y = placed.wy;
    s.z = placed.wz;
    s.corr++;
    pod.occupant = s.id;
    pod.rescue = 0;
    h.statCaptures++;
    this.fx({ kind: "pod", id: h.id, target: s.id, ref: podId, x: placed.wx, y: placed.wy, z: placed.wz });
    this.notice(`${s.name} was captured!`, "bad");
  }

  private rescue(podId: string, rescuer: PlayerState) {
    const pod = this.state.pods.get(podId);
    const placed = this.rt!.pods.find((x) => x.id === podId);
    if (!pod || !placed) return;
    const s = this.state.players.get(pod.occupant);
    pod.occupant = "";
    pod.rescue = 0;
    if (!s) return;
    s.status = "free";
    s.pod = "";
    // Step out toward the rescuer.
    const dx = rescuer.x - placed.wx,
      dz = rescuer.z - placed.wz;
    const len = Math.hypot(dx, dz) || 1;
    s.x = placed.wx + (dx / len) * 1.2;
    s.z = placed.wz + (dz / len) * 1.2;
    if (!positionIsClear(this.rt!, s.x, s.y, s.z, false)) {
      s.x = rescuer.x;
      s.z = rescuer.z;
    }
    s.corr++;
    this.addEffect(s, "protected", PROTECT_SECONDS);
    this.addEffect(s, "rescued", PROTECT_SECONDS);
    rescuer.statRescues++;
    this.fx({ kind: "rescue", id: rescuer.id, target: s.id, x: placed.wx, y: placed.wy, z: placed.wz });
    this.notice(`${rescuer.name} rescued ${s.name}!`, "good");
  }

  private tickTerminals(now: number, dt: number) {
    const rt = this.rt!;
    const rates = new Map<string, { n: number; mult: number }>();
    for (const p of this.state.players.values()) {
      if (!p.hacking || p.status !== "free") continue;
      const st = this.state.terminals.get(p.hacking);
      if (!st || st.hacked || st.jammedUntil > now) {
        this.stopHacking(p);
        continue;
      }
      const r = rates.get(p.hacking) ?? { n: 0, mult: 0 };
      r.n++;
      r.mult += hasEffect(this.effectsOf(p), "overclock", now) ? (this.settings.powerups.overclock?.magnitude ?? 1.8) : 1;
      rates.set(p.hacking, r);

      // Skill checks
      if (this.settings.skillChecks) {
        const pending = this.checks.get(p.id);
        if (pending && now > pending.deadline + 2500) {
          this.checks.delete(p.id);
          this.failCheck(p.id, pending.terminal);
        } else if (!pending && now >= (this.nextCheckAt.get(p.id) ?? Infinity)) {
          const total = SKILL_CHECK_MS;
          const start = Math.round(total * (0.45 + Math.random() * 0.33));
          const msg: SkillCheckMsg = { id: this.checkSeq++, start, end: start + Math.round(total * 0.17), total };
          this.checks.set(p.id, { id: msg.id, terminal: p.hacking, issuedAt: now, deadline: now + total + 600 });
          this.nextCheckAt.set(p.id, now + 5000 + Math.random() * 6000);
          this.clientOf(p.id)?.send("skillCheck", msg);
        }
      }
    }
    for (const [id, st] of this.state.terminals) {
      const r = rates.get(id);
      st.hackers = r?.n ?? 0;
      if (!r || st.hacked) continue;
      const teamwork = r.n > 1 ? 0.85 : 1;
      const gain = (dt / BASE_HACK_SECONDS) * this.settings.hackSpeed * r.mult * teamwork;
      st.progress = Math.min(1, st.progress + gain);
      for (const p of this.state.players.values()) if (p.hacking === id) p.statHacks += Math.round((gain / r.n) * 1000);
      if (st.progress >= 1) {
        st.hacked = true;
        st.hackers = 0;
        for (const p of this.state.players.values()) if (p.hacking === id) this.stopHacking(p);
        this.state.terminalsHacked++;
        const t = rt.terminals.find((x) => x.id === id)!;
        this.fx({ kind: "hacked", ref: id, x: t.wx, y: t.wy, z: t.wz });
        const left = this.state.terminalsRequired - this.state.terminalsHacked;
        if (left > 0) this.notice(`Terminal hacked: ${left} to go`, "good");
        else if (!this.state.exitsPowered) {
          this.state.exitsPowered = true;
          this.fx({ kind: "exitsPowered" });
          this.notice("Exit doors are powered! Open one and escape!", "good");
        }
      }
    }
  }

  private tickPickups(now: number) {
    const rt = this.rt!;
    const enabled = SURVIVOR_POWERUPS.filter((p) => this.settings.powerups[p.id]?.enabled);
    if (!this.settings.survivorPowerupsEnabled || !enabled.length || !rt.pickups.length) return;
    if (now >= this.nextPickupAt) {
      this.nextPickupAt = now + this.settings.pickupIntervalSeconds * 1000;
      const used = new Set(Array.from(this.state.pickups.keys()));
      const free = rt.pickups.filter((p) => !used.has(p.id));
      if (free.length) {
        const spot = free[Math.floor(Math.random() * free.length)];
        const ps = new PickupState();
        ps.x = spot.wx;
        ps.y = spot.wy;
        ps.z = spot.wz;
        this.state.pickups.set(spot.id, ps);
      }
    }
    for (const [id, pk] of this.state.pickups) {
      for (const p of this.state.players.values()) {
        if (p.role !== "survivor" || p.status !== "free" || p.slots.length >= this.settings.maxPickupSlots) continue;
        if (!this.near(p, pk.x, pk.y, pk.z, RANGE.pickup)) continue;
        const def = enabled[Math.floor(Math.random() * enabled.length)];
        p.slots.push(def.id);
        this.state.pickups.delete(id);
        this.clientOf(p.id)?.send("fx", { kind: "powerupGet", id: p.id, ability: def.id } satisfies FxEvent);
        break;
      }
    }
  }

  private tickTraps(now: number) {
    for (const [id, t] of this.state.traps) {
      if (t.sprung) continue;
      for (const s of this.state.players.values()) {
        if (s.role !== "survivor" || s.status !== "free") continue;
        if (!this.near(s, t.x, t.y, t.z, 0.9)) continue;
        t.sprung = true;
        const dur = this.settings.powerups.snare?.duration ?? 3;
        this.addEffect(s, "rooted", dur);
        this.stopHacking(s);
        const owner = this.state.players.get(t.owner);
        if (owner) this.revealTo([owner], [s.id], dur + 2, "trap");
        this.fx({ kind: "trap", id: t.owner, target: s.id, x: t.x, y: t.y, z: t.z });
        this.clock.setTimeout(() => this.state.traps.delete(id), 2500);
        break;
      }
    }
    void now;
  }

  private tickZones(now: number, dt: number) {
    const rt = this.rt!;
    for (const [id, z] of this.state.zones) {
      if (z.endsAt <= now) {
        this.state.zones.delete(id);
        continue;
      }
      if (z.kind === "decoy") {
        const nx = z.x + Math.sin(z.ry) * 5.2 * dt;
        const nz = z.z + Math.cos(z.ry) * 5.2 * dt;
        if (positionIsClear(rt, nx, z.y, nz, false)) {
          z.x = nx;
          z.z = nz;
        } else z.ry += Math.PI / 2; // turn at walls
      }
    }
  }

  private checkRoundEnd() {
    if (this.state.phase !== "playing" && this.state.phase !== "headstart") return;
    const all = Array.from(this.state.players.values());
    const survivors = all.filter((p) => p.role === "survivor");
    const hunters = all.filter((p) => p.role === "hunter");
    const active = survivors.filter((p) => ["free", "downed", "carried", "podded"].includes(p.status));
    const escaped = survivors.filter((p) => p.status === "escaped");

    // Escape detection: a free survivor standing in an open exit.
    if (this.rt && this.state.exitsPowered) {
      for (const s of active) {
        if (s.status !== "free") continue;
        for (const ex of this.rt.exits) {
          if (!this.state.exits.get(ex.id)?.open) continue;
          if (Math.abs(s.y - ex.wy) < 1.5 && this.dist2(s.x, s.z, ex.wx, ex.wz) < 1.3 * 1.3) {
            s.status = "escaped";
            this.stopHacking(s);
            this.fx({ kind: "escape", id: s.id, x: s.x, y: s.y, z: s.z });
            this.notice(`${s.name} escaped!`, "good");
            escaped.push(s);
            break;
          }
        }
      }
    }
    const stillActive = survivors.filter((p) => ["free", "downed", "carried", "podded"].includes(p.status));
    if (survivors.length === 0 || hunters.length === 0) {
      return this.endRound(survivors.length === 0 ? "nosurvivors" : "nohunters");
    }
    if (stillActive.length === 0) this.endRound(escaped.length > 0 ? "escaped" : "captured");
  }

  private endRound(reason: "time" | "escaped" | "captured" | "nosurvivors" | "nohunters") {
    const survivors = Array.from(this.state.players.values()).filter((p) => p.role === "survivor");
    const escaped = survivors.filter((p) => p.status === "escaped").length;
    const survivorsWin = escaped > 0 || reason === "nohunters";
    this.state.winner = survivorsWin ? "survivors" : "hunters";
    this.state.resultText =
      reason === "nohunters"
        ? "The Hunter left the facility."
        : reason === "nosurvivors"
          ? "No Survivors remain."
          : reason === "time"
            ? escaped > 0
              ? `Time's up! ${escaped} Survivor${escaped === 1 ? "" : "s"} made it out.`
              : "Time's up! Nobody escaped."
            : escaped > 0
              ? `${escaped} of ${survivors.length} Survivors escaped.`
              : "Every Survivor was captured.";
    for (const p of this.state.players.values()) {
      if ((survivorsWin && p.role === "survivor" && p.status === "escaped") || (!survivorsWin && p.role === "hunter")) p.wins++;
      this.stopHacking(p);
    }
    this.holds.clear();
    this.holdTimers.clear();
    this.state.phase = "results";
    this.state.phaseEndsAt = this.now() + RESULTS_MS;
  }
}
