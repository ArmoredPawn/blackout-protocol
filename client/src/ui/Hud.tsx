import { useEffect, useMemo, useRef, useState } from "react";
import { POWERUP_MAP, RANGE, parseEffects, type PowerupDef } from "@bp/shared";
import { net } from "../net/connection";
import type { PlayerSnap, RoomSnap } from "../net/types";
import { useApp } from "../store";
import { audio } from "../game/audio";
import { input } from "../game/input";
import { game } from "../game/state";
import { keyLabel, type Action } from "../prefs";
import { Icon, PowerupIcon } from "./Icon";
import { drawMap } from "./MapPreview";
import { ChatBox } from "./Chat";

const STATUS_LABEL: Record<string, { t: string; c: string }> = {
  free: { t: "Free", c: "#38ff9c" },
  downed: { t: "Downed", c: "#ffb020" },
  carried: { t: "Carried", c: "#ff8a3c" },
  podded: { t: "Captured", c: "#ff4d5e" },
  eliminated: { t: "Out", c: "#6a7488" },
  escaped: { t: "Escaped", c: "#7fdcff" },
  spectating: { t: "Watching", c: "#6a7488" },
  lobby: { t: "—", c: "#6a7488" },
};

function useNow(ms = 200) {
  const [n, setN] = useState(net.serverNow());
  useEffect(() => {
    const t = setInterval(() => setN(net.serverNow()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return n;
}

const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function bind(action: Action) {
  const b = useApp.getState().prefs.bindings[action];
  return keyLabel(b?.[0] ?? "?");
}

function TopBar({ snap, now }: { snap: RoomSnap; now: number }) {
  const headstart = snap.phase === "headstart";
  const left = snap.phaseEndsAt - now;
  const dots = Array.from({ length: snap.terminalsRequired }, (_, i) => i < snap.terminalsHacked);
  return (
    <div className="hud-top">
      <div className="hud-pill">
        <span className="timer" style={{ color: headstart ? "var(--warn)" : left < 60000 ? "var(--hunter)" : undefined }}>{fmt(left)}</span>
        {headstart && <span className="muted" style={{ fontSize: 12 }}>head start</span>}
      </div>
      <div className="hud-pill">
        {snap.exitsPowered ? (
          <span style={{ color: "var(--good)", fontWeight: 700, fontFamily: "var(--display)" }}>EXITS POWERED</span>
        ) : (
          <>
            <div className="term-dots" aria-label={`${snap.terminalsHacked} of ${snap.terminalsRequired} terminals hacked`}>
              {dots.map((d, i) => (
                <span key={i} className={`term-dot ${d ? "done" : ""}`} />
              ))}
            </div>
            <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
              {snap.terminalsRequired - snap.terminalsHacked} left
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function TeamPanel({ snap, myId, now }: { snap: RoomSnap; myId: string; now: number }) {
  const players = Object.values(snap.players).filter((p) => p.role !== "none");
  const hunters = players.filter((p) => p.role === "hunter");
  const survivors = players.filter((p) => p.role === "survivor");
  const row = (p: PlayerSnap) => {
    const st = STATUS_LABEL[p.status] ?? STATUS_LABEL.free;
    const podLeft = p.status === "podded" ? ` ${Math.max(0, Math.ceil((p.podEndsAt - now) / 1000))}s` : "";
    return (
      <div key={p.id} className="team-row" style={{ borderColor: p.id === myId ? "rgba(60,255,210,.4)" : undefined, opacity: p.connected ? 1 : 0.55 }}>
        <span className="dot" style={{ background: p.role === "hunter" ? "var(--hunter)" : "var(--survivor)" }} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
        {p.role === "survivor" && (
          <span className="st" style={{ color: st.c }}>
            {st.t}
            {podLeft}
          </span>
        )}
      </div>
    );
  };
  return (
    <div className="team">
      {hunters.map(row)}
      <div style={{ height: 4 }} />
      {survivors.map(row)}
    </div>
  );
}

/** Context-sensitive prompt ("Hold E to hack") computed from local proximity. */
function Prompt({ snap, me, now }: { snap: RoomSnap; me: PlayerSnap; now: number }) {
  const rt = game.rt;
  if (!rt || snap.phase !== "playing") return null;
  const b = game.body;
  const near = (x: number, y: number, z: number, r: number) => Math.abs(b.y - y) < 1.8 && (b.x - x) ** 2 + (b.z - z) ** 2 <= r * r;
  const E = bind("interact");
  let text = "";
  let bar: { v: number; c: string } | null = null;
  if (me.role === "survivor") {
    if (me.status === "downed") text = `You're down! Recovering in ${Math.max(0, Math.ceil((me.downedEndsAt - now) / 1000))}s. Crawl to safety.`;
    else if (me.status === "carried") {
      text = `Mash ${bind("jump")} to struggle free!`;
      bar = { v: me.struggle, c: "#ffb020" };
    } else if (me.status === "podded") text = `Captured! Hold on. ${Math.max(0, Math.ceil((me.podEndsAt - now) / 1000))}s until you're out.`;
    else if (me.status === "free") {
      if (me.hacking) {
        const t = snap.terminals[me.hacking];
        text = "Hacking…";
        if (t) bar = { v: t.progress, c: "#3aa8ff" };
      } else {
        const pod = rt.pods.find((p) => snap.pods[p.id]?.occupant && near(p.wx, p.wy, p.wz, RANGE.rescue));
        const exit = snap.exitsPowered ? rt.exits.find((e) => !snap.exits[e.id]?.open && near(e.ix, e.wy, e.iz, RANGE.exit)) : undefined;
        const term = rt.terminals.find((t) => !snap.terminals[t.id]?.hacked && near(t.wx, t.wy, t.wz, RANGE.terminal));
        if (pod) {
          text = `Hold ${E} to rescue`;
          bar = { v: snap.pods[pod.id].rescue, c: "#38ff9c" };
        } else if (exit) {
          text = `Hold ${E} to open the exit`;
          bar = { v: snap.exits[exit.id].progress, c: "#ffd84a" };
        } else if (term) {
          const st = snap.terminals[term.id];
          text = st.jammedUntil > now ? "Terminal jammed by Lockdown" : `Hold ${E} to hack`;
        }
      }
    }
  } else if (me.role === "hunter" && me.status === "free") {
    const eff = parseEffects(me.effects);
    if ((eff.get("stunned") ?? 0) > now) text = "Stunned!";
    else if (me.carrying) {
      const pod = rt.pods.find((p) => !snap.pods[p.id]?.occupant && near(p.wx, p.wy, p.wz, RANGE.pod));
      text = pod ? `Hold ${E} to put them in the pod` : "Carry them to a stasis pod";
    } else {
      const downed = Object.values(snap.players).find((p) => p.status === "downed" && near(p.x, p.y, p.z, RANGE.downed));
      if (downed) text = `Hold ${E} to pick up ${downed.name}`;
    }
  }
  if (!text) return null;
  const [pre, post] = text.includes(` ${E} `) ? text.split(` ${E} `) : [text, null];
  return (
    <div className="prompt" style={{ flexDirection: "column", gap: 6 }}>
      <div className="row" style={{ gap: 8 }}>
        {post !== null ? (
          <>
            {pre} <span className="kbd">{E}</span> {post}
          </>
        ) : (
          text
        )}
      </div>
      {bar && (
        <div style={{ width: 220, height: 8, borderRadius: 4, background: "#1c2433", overflow: "hidden" }}>
          <div style={{ width: `${Math.round(bar.v * 100)}%`, height: "100%", background: bar.c, transition: "width .1s linear" }} />
        </div>
      )}
    </div>
  );
}

function AbilityButton({ def, keyName, cooldownLeft, total, onClick, active, empty }: {
  def?: PowerupDef; keyName: string; cooldownLeft?: number; total?: number; onClick(): void; active?: boolean; empty?: boolean;
}) {
  const cd = cooldownLeft && cooldownLeft > 0 ? cooldownLeft : 0;
  return (
    <button className={`ability ${empty ? "empty" : ""} ${active ? "active" : ""}`} onClick={onClick} title={def ? `${def.name}: ${def.description}` : "Empty slot"} style={{ borderColor: def ? `${def.color}88` : undefined }}>
      <span className="key">{keyName}</span>
      {def ? <PowerupIcon id={def.id} size={30} /> : <span className="muted">—</span>}
      {cd > 0 && total ? (
        <span className="cd" style={{ clipPath: `inset(${100 - (cd / total) * 100}% 0 0 0)` }}>
          {Math.ceil(cd / 1000)}
        </span>
      ) : null}
    </button>
  );
}

function Abilities({ me, now }: { me: PlayerSnap; now: number }) {
  const settings = useApp((s) => s.settings);
  const eff = parseEffects(me.effects);
  if (me.role === "hunter") {
    const def = POWERUP_MAP[me.ability];
    const total = (settings.powerups[me.ability]?.cooldown ?? 30) * 1000;
    const swingTotal = settings.swingCooldown * 1000;
    return (
      <div className="abilities">
        <button className="ability" title="Swing (left click)" onClick={() => net.send("swing", { ry: game.ry })}>
          <span className="key">LMB</span>
          <svg width="30" height="30" viewBox="0 0 24 24">
            <path d="M4 20 14 10l2 2L6 22zM14 4l6 6-3 3-6-6z" fill="#ff4d5e" />
          </svg>
          {me.swingReadyAt > now && <span className="cd" style={{ clipPath: `inset(${100 - ((me.swingReadyAt - now) / swingTotal) * 100}% 0 0 0)` }} />}
        </button>
        {def && settings.hunterAbilitiesEnabled && (
          <AbilityButton def={def} keyName={bind("ability")} cooldownLeft={me.abilityReadyAt - now} total={total} active={[...eff.keys()].some((k) => k === me.ability && (eff.get(k) ?? 0) > now)} onClick={() => net.send("ability", { slot: -1 })} />
        )}
      </div>
    );
  }
  if (me.role !== "survivor" || !settings.survivorPowerupsEnabled) return null;
  const slots = Array.from({ length: settings.maxPickupSlots }, (_, i) => me.slots[i]);
  return (
    <div className="abilities">
      {slots.map((id, i) => (
        <AbilityButton key={i} def={id ? POWERUP_MAP[id] : undefined} keyName={i === 0 ? `${bind("ability")}/1` : String(i + 1)} empty={!id} onClick={() => id && net.send("ability", { slot: i })} />
      ))}
    </div>
  );
}

/** Timing check while hacking: hit Space/click while the needle is in the green zone. */
function SkillCheck() {
  const sc = useApp((s) => s.skillCheck);
  const canvas = useRef<HTMLCanvasElement>(null!);
  const done = useRef(false);
  useEffect(() => {
    if (!sc) return;
    done.current = false;
    audio.play("skill");
    let raf = 0;
    const finish = (hit: boolean) => {
      if (done.current) return;
      done.current = true;
      net.send("check", { id: sc.id, hit });
      audio.play(hit ? "skillOk" : "skillFail");
      setTimeout(() => useApp.setState((s) => (s.skillCheck?.id === sc.id ? { skillCheck: null } : {})), hit ? 150 : 350);
    };
    const press = () => {
      const t = performance.now() - sc.receivedAt;
      finish(t >= sc.start && t <= sc.end);
    };
    const off = input.on((a, down) => down && a === "jump" && press());
    const click = (e: MouseEvent) => {
      if (e.button === 0) press();
    };
    window.addEventListener("mousedown", click);
    const draw = () => {
      const c = canvas.current;
      if (!c) return;
      const g = c.getContext("2d")!;
      const t = performance.now() - sc.receivedAt;
      if (t > sc.total && !done.current) finish(false);
      const s = c.width;
      g.clearRect(0, 0, s, s);
      const cx = s / 2,
        r = s * 0.38;
      const ang = (v: number) => -Math.PI / 2 + (v / sc.total) * Math.PI * 2;
      g.lineWidth = s * 0.07;
      g.strokeStyle = "rgba(255,255,255,0.18)";
      g.beginPath();
      g.arc(cx, cx, r, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = "#38ff9c";
      g.beginPath();
      g.arc(cx, cx, r, ang(sc.start), ang(sc.end));
      g.stroke();
      g.strokeStyle = "#fff";
      g.lineWidth = s * 0.025;
      const a = ang(Math.min(t, sc.total));
      g.beginPath();
      g.moveTo(cx, cx);
      g.lineTo(cx + Math.cos(a) * r * 1.12, cx + Math.sin(a) * r * 1.12);
      g.stroke();
      g.fillStyle = "#fff";
      g.font = `700 ${s * 0.12}px Chakra Petch, sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(useApp.getState().prefs.bindings.jump[0] === "Space" ? "SPACE" : keyLabel(useApp.getState().prefs.bindings.jump[0]), cx, cx);
      if (!done.current) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      off();
      window.removeEventListener("mousedown", click);
    };
  }, [sc]);
  if (!sc) return null;
  return (
    <div className="skillcheck" onTouchStart={() => input.emit("jump", true)}>
      <canvas ref={canvas} width={220} height={220} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

function Banner({ snap, me, now }: { snap: RoomSnap; me: PlayerSnap; now: number }) {
  const [flash, setFlash] = useState<{ t: string; s: string; c: string } | null>(null);
  useEffect(
    () =>
      net.fx.on((e) => {
        if (e.kind === "exitsPowered") setFlash({ t: "EXITS POWERED", s: "Find an exit door and hold E to open it", c: "var(--good)" });
        if (e.kind === "escape" && e.id === net.room?.sessionId) setFlash({ t: "YOU ESCAPED", s: "Nice. Watch the others make it out.", c: "#7fdcff" });
        if (e.kind === "eliminated" && e.id === net.room?.sessionId) setFlash({ t: "ELIMINATED", s: "Click to spectate other players", c: "var(--hunter)" });
      }),
    [],
  );
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 3500);
    return () => clearTimeout(t);
  }, [flash]);
  if (snap.phase === "headstart") {
    const hunter = me.role === "hunter";
    return (
      <div className="center-banner">
        <h1 style={{ color: hunter ? "var(--hunter)" : "var(--survivor)" }}>{hunter ? "YOU ARE THE HUNTER" : "YOU ARE A SURVIVOR"}</h1>
        <p>
          {hunter
            ? `You're released in ${Math.ceil((snap.phaseEndsAt - now) / 1000)}s. Down Survivors and put them in stasis pods.`
            : `Hack ${snap.terminalsRequired} terminals, then escape. The Hunter is released in ${Math.ceil((snap.phaseEndsAt - now) / 1000)}s!`}
        </p>
      </div>
    );
  }
  if (flash)
    return (
      <div className="center-banner">
        <h1 style={{ color: flash.c }}>{flash.t}</h1>
        <p>{flash.s}</p>
      </div>
    );
  if (me.status === "spectating" || me.status === "eliminated" || me.status === "escaped")
    return (
      <div className="center-banner" style={{ top: "auto", bottom: 90, transform: "translateX(-50%)" }}>
        <p>Spectating: click to switch player</p>
      </div>
    );
  return null;
}

function Results({ snap, myId }: { snap: RoomSnap; myId: string }) {
  const now = useNow(250);
  const players = Object.values(snap.players).filter((p) => p.role !== "none");
  const me = snap.players[myId];
  const won = (snap.winner === "survivors" && me?.role === "survivor" && me.status === "escaped") || (snap.winner === "hunters" && me?.role === "hunter");
  useEffect(() => {
    audio.play("roundEnd");
  }, []);
  return (
    <div className="overlay">
      <div className="panel modal">
        <div className="col" style={{ alignItems: "center", textAlign: "center", gap: 6, marginBottom: 14 }}>
          <span className="label">Round {snap.round} complete</span>
          <h1 style={{ fontSize: 40, color: snap.winner === "survivors" ? "var(--survivor)" : "var(--hunter)" }}>
            {snap.winner === "survivors" ? "SURVIVORS WIN" : "HUNTERS WIN"}
          </h1>
          <p className="muted" style={{ margin: 0 }}>{snap.resultText}</p>
          {me && me.role !== "none" && <span className={`chip ${won ? "good" : ""}`}>{won ? "Victory" : "Defeat"}</span>}
        </div>
        <table className="results-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Role</th>
              <th>Outcome</th>
              <th>Hacked</th>
              <th>Rescues</th>
              <th>Captures</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.id} style={{ color: p.id === myId ? "var(--accent)" : undefined }}>
                <td>{p.name}</td>
                <td>
                  <span className={`chip ${p.role}`}>{p.role === "hunter" ? "Hunter" : "Survivor"}</span>
                </td>
                <td>{p.role === "hunter" ? "—" : STATUS_LABEL[p.status]?.t === "Free" ? "Survived" : STATUS_LABEL[p.status]?.t}</td>
                <td>{p.role === "survivor" ? `${Math.round(p.statHacks / 10)}%` : "—"}</td>
                <td>{p.statRescues || "—"}</td>
                <td>{p.statCaptures || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row" style={{ marginTop: 16, justifyContent: "center" }}>
          <span className="muted">Intermission in {Math.max(0, Math.ceil((snap.phaseEndsAt - now) / 1000))}s</span>
          {snap.hostId === myId && (
            <button className="btn small" onClick={() => net.send("returnToLobby")}>
              Back to lobby
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniMap({ snap, me }: { snap: RoomSnap; me: PlayerSnap }) {
  const ref = useRef<HTMLCanvasElement>(null!);
  const now = useNow(300);
  const rt = game.rt;
  const floor = rt ? rt.floorOf(game.body.y) : 0;
  useEffect(() => {
    if (!rt || !ref.current) return;
    const markers = [{ x: game.body.x, z: game.body.z, color: "#3cffd2", r: 1 }];
    if (me.role === "survivor")
      for (const p of Object.values(snap.players))
        if (p.role === "survivor" && p.id !== me.id && (p.status === "podded" || p.status === "downed") && rt.floorOf(p.y) === floor)
          markers.push({ x: p.x, z: p.z, color: p.status === "podded" ? "#ff4d5e" : "#ffb020", r: 0.8 });
    drawMap(ref.current, rt, { floor, markers, terminalState: snap.terminals });
  }, [now, rt, floor, snap, me]);
  return (
    <div className="overlay" onClick={() => useApp.setState({ showMap: false })}>
      <div className="panel minimap" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ marginBottom: 10 }}>
          <h3 className="grow">{snap.mapName}: {floor === 0 ? "Ground floor" : `Floor ${floor + 1}`}</h3>
          <span className="chip" style={{ color: "#3aa8ff" }}>■ Terminal</span>
          <span className="chip" style={{ color: "#38ff9c" }}>■ Hacked</span>
          <span className="chip" style={{ color: "#ff4d5e" }}>■ Pod</span>
          <span className="chip" style={{ color: "#ffd84a" }}>■ Exit</span>
        </div>
        <canvas ref={ref} />
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
          Press {bind("map")} or tap outside to close.
        </p>
      </div>
    </div>
  );
}

function Scoreboard({ snap }: { snap: RoomSnap }) {
  const [show, setShow] = useState(false);
  useEffect(() => input.on((a, down) => a === "scoreboard" && setShow(down)), []);
  if (!show) return null;
  const players = Object.values(snap.players).sort((a, b) => b.wins - a.wins);
  return (
    <div className="overlay" style={{ background: "rgba(3,5,9,.45)", pointerEvents: "none" }}>
      <div className="panel modal" style={{ width: "min(460px, 100%)" }}>
        <h3 style={{ marginBottom: 10 }}>Scoreboard</h3>
        <table className="results-table">
          <tbody>
            {players.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.role !== "none" && <span className={`chip ${p.role}`}>{p.role}</span>}</td>
                <td>{STATUS_LABEL[p.status]?.t}</td>
                <td>★ {p.wins}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Screen-space effects: downed/carried vignette, smoke blindness, low-time pulse. */
function Vignette({ snap, me, now }: { snap: RoomSnap; me: PlayerSnap; now: number }) {
  let style: React.CSSProperties = { opacity: 0 };
  const inSmoke =
    me.role === "hunter" &&
    Object.values(snap.zones).some((z) => z.kind === "smoke" && (me.x - z.x) ** 2 + (me.z - z.z) ** 2 < (z.radius + 1.5) ** 2);
  const eff = parseEffects(me.effects);
  if (inSmoke) style = { opacity: 1, background: "radial-gradient(circle, rgba(200,204,212,.55), rgba(200,204,212,.95))" };
  else if (me.status === "downed" || me.status === "carried" || me.status === "podded")
    style = { opacity: 1, background: "radial-gradient(circle, transparent 45%, rgba(255,40,60,.45))" };
  else if ((eff.get("rooted") ?? 0) > now) style = { opacity: 1, background: "radial-gradient(circle, transparent 55%, rgba(212,160,23,.45))" };
  else if ((eff.get("ghost") ?? 0) > now) style = { opacity: 1, background: "radial-gradient(circle, transparent 60%, rgba(155,232,255,.25))" };
  return <div className="vignette" style={style} />;
}

function MenuButton() {
  return (
    <div style={{ position: "absolute", top: "max(10px, env(safe-area-inset-top))", right: "max(10px, env(safe-area-inset-right))", display: "flex", gap: 6 }}>
      <button className="btn small" onClick={() => useApp.setState({ showMap: true })} aria-label="Map">
        <Icon name="map" size={16} />
      </button>
      <button className="btn small" onClick={() => useApp.setState({ showPrefs: true })} aria-label="Settings">
        <Icon name="gear" size={16} />
      </button>
      <button
        className="btn small danger"
        onClick={() => {
          if (confirm("Leave this room?")) void net.leave();
        }}
        aria-label="Leave room"
      >
        <Icon name="exit" size={16} />
      </button>
    </div>
  );
}

export function Hud() {
  const snap = useApp((s) => s.snap);
  const myId = useApp((s) => s.myId);
  const showMap = useApp((s) => s.showMap);
  const conn = useApp((s) => s.conn);
  const now = useNow(150);
  const me = snap?.players[myId];
  const phase = snap?.phase;
  const lastPhase = useRef(phase);
  useEffect(() => {
    if (phase === "playing" && lastPhase.current === "headstart") audio.play("roundStart");
    lastPhase.current = phase;
  }, [phase]);
  const mouseLock = useMemo(() => input.mouseLocked, [now]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!snap || !me) return null;
  return (
    <div className="hud">
      <Vignette snap={snap} me={me} now={now} />
      {(mouseLock || game.firstPerson) && <div className="crosshair" />}
      <TopBar snap={snap} now={now} />
      <TeamPanel snap={snap} myId={myId} now={now} />
      <MenuButton />
      <Banner snap={snap} me={me} now={now} />
      <Prompt snap={snap} me={me} now={now} />
      <Abilities me={me} now={now} />
      <SkillCheck />
      <ChatBox />
      <Scoreboard snap={snap} />
      {showMap && <MiniMap snap={snap} me={me} />}
      {snap.phase === "results" && <Results snap={snap} myId={myId} />}
      {conn === "reconnecting" && (
        <div className="overlay">
          <div className="col" style={{ alignItems: "center" }}>
            <div className="spinner" />
            <p>Connection lost. Reconnecting…</p>
          </div>
        </div>
      )}
    </div>
  );
}
