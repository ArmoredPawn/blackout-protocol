import { useEffect, useMemo, useState } from "react";
import { HUNTER_POWERUPS, POWERUP_MAP, formatRoomCode, parseAvatar, DEFAULT_AVATAR } from "@bp/shared";
import { net } from "../net/connection";
import { useApp } from "../store";
import { AvatarPreview } from "./AvatarPreview";
import { Icon, PowerupIcon } from "./Icon";
import { SettingsPanel } from "./SettingsPanel";
import { ChatBox } from "./Chat";

export function inviteLink(code: string) {
  return `${location.origin}${location.pathname}#/join/${formatRoomCode(code)}`;
}

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    useApp.getState().toast(`${what} copied`, "good");
  } catch {
    prompt(`Copy the ${what.toLowerCase()}:`, text);
  }
}

export function Lobby() {
  const snap = useApp((s) => s.snap);
  const myId = useApp((s) => s.myId);
  const settings = useApp((s) => s.settings);
  const prefs = useApp((s) => s.prefs);
  const [now, setNow] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setNow(net.serverNow()), 250);
    return () => clearInterval(t);
  }, []);
  // Push profile changes (e.g. edited avatar) to the room.
  useEffect(() => {
    net.send("profile", { name: prefs.name, avatar: JSON.stringify(prefs.avatar) });
  }, [prefs.name, prefs.avatar]);

  const players = useMemo(() => Object.values(snap?.players ?? {}).sort((a, b) => a.joinOrder - b.joinOrder), [snap?.players]);
  if (!snap) return null;
  const me = snap.players[myId];
  const host = snap.hostId === myId;
  const code = snap.code;
  const notReady = players.filter((p) => !p.ready && p.id !== snap.hostId && p.connected).length;
  const countdown = snap.phase === "intermission" ? Math.max(0, Math.ceil((snap.phaseEndsAt - now) / 1000)) : 0;
  const enabledAbilities = HUNTER_POWERUPS.filter((h) => settings.powerups[h.id]?.enabled);
  const myAvatar = parseAvatar(me?.avatar ?? "") ?? DEFAULT_AVATAR;

  return (
    <div className="screen">
      <div className="lobby">
        <div className="panel lobby-head">
          <div className="col" style={{ gap: 2 }}>
            <span className="label">Private room code</span>
            <span className="room-code">{formatRoomCode(code)}</span>
          </div>
          <div className="row wrap">
            <button className="btn small" onClick={() => copy(formatRoomCode(code), "Room code")}>
              <Icon name="copy" size={16} /> Copy code
            </button>
            <button className="btn small primary" onClick={() => copy(inviteLink(code), "Invite link")}>
              <Icon name="link" size={16} /> Copy invite link
            </button>
          </div>
          <span className="grow" />
          <span className="muted" style={{ fontSize: 13 }}>
            Only people with this code or link can join.
          </span>
          <button className="btn small ghost" onClick={() => useApp.setState({ showPrefs: true })} aria-label="Settings">
            <Icon name="gear" size={16} />
          </button>
          <button className="btn small danger" onClick={() => net.leave()}>
            <Icon name="exit" size={16} /> Leave
          </button>
        </div>

        <div className="col" style={{ gap: 18, minHeight: 0 }}>
          <div className="panel section">
            <div className="row">
              <h3 className="grow">
                Players <span className="muted">{players.length}/{settings.maxPlayers}</span>
              </h3>
              {snap.round > 0 && <span className="chip">Round {snap.round}</span>}
            </div>
            <div className="player-list">
              {players.map((p) => (
                <div key={p.id} className={`player-row ${p.id === myId ? "me" : ""}`}>
                  <span className={`dot ${p.connected ? "on" : ""}`} title={p.connected ? "Connected" : "Reconnecting…"} />
                  <span className="grow" style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.name}
                    {p.id === myId && <span className="muted"> (you)</span>}
                  </span>
                  {p.wins > 0 && <span className="chip" title="Wins this session">★ {p.wins}</span>}
                  {p.id === snap.hostId ? (
                    <span className="chip warn">
                      <Icon name="crown" size={12} /> Host
                    </span>
                  ) : p.ready ? (
                    <span className="chip good">Ready</span>
                  ) : (
                    <span className="chip">Not ready</span>
                  )}
                  {host && p.id !== myId && (
                    <>
                      <button className="btn small ghost" title="Make host" onClick={() => net.send("transferHost", p.id)}>
                        <Icon name="crown" size={14} />
                      </button>
                      <button
                        className="btn small danger"
                        title="Kick"
                        onClick={() => {
                          if (confirm(`Remove ${p.name} from the room?`)) net.send("kick", p.id);
                        }}
                      >
                        Kick
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
            {snap.phase === "intermission" ? (
              <div className="row" style={{ justifyContent: "center", padding: 8 }}>
                <span className="chip good" style={{ fontSize: 15, padding: "6px 14px" }}>
                  Next round in {countdown}s
                </span>
                {host && (
                  <button className="btn small ghost" onClick={() => net.send("returnToLobby")}>
                    Stop & stay in lobby
                  </button>
                )}
              </div>
            ) : host ? (
              <button className="btn primary big" disabled={players.length < 2 || notReady > 0} onClick={() => net.send("start")}>
                {players.length < 2 ? "Waiting for players…" : notReady > 0 ? `Waiting for ${notReady} to ready up` : "Start match"}
              </button>
            ) : (
              <button className={`btn big ${me?.ready ? "" : "primary"}`} onClick={() => net.send("ready", !me?.ready)}>
                {me?.ready ? "Not ready" : "Ready up"}
              </button>
            )}
          </div>

          <div className="panel section">
            <div className="row" style={{ alignItems: "stretch" }}>
              <div style={{ width: 120, height: 150, borderRadius: 10, overflow: "hidden", flex: "none", border: "1px solid var(--line)" }}>
                <AvatarPreview avatar={myAvatar} />
              </div>
              <div className="col grow">
                <h3>Your Hunter ability</h3>
                {settings.hunterAbilitiesEnabled && enabledAbilities.length ? (
                  settings.hunterAbilityMode === "choose" ? (
                    <div className="opts">
                      {enabledAbilities.map((a) => (
                        <button key={a.id} className={`opt ${me?.ability === a.id ? "on" : ""}`} onClick={() => net.send("chooseAbility", a.id)} title={a.description} style={{ textTransform: "none" }}>
                          <span className="row" style={{ gap: 6 }}>
                            <PowerupIcon id={a.id} size={16} /> {a.name}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className="muted">The host set abilities to random.</span>
                  )
                ) : (
                  <span className="muted">Hunter abilities are disabled.</span>
                )}
                {me?.ability && POWERUP_MAP[me.ability] && settings.hunterAbilityMode === "choose" && (
                  <span className="muted" style={{ fontSize: 12 }}>{POWERUP_MAP[me.ability].description}</span>
                )}
                <button className="btn small" style={{ alignSelf: "flex-start" }} onClick={() => useApp.setState({ screen: "avatar" })}>
                  Edit avatar
                </button>
              </div>
            </div>
          </div>
          <div className="panel section" style={{ minHeight: 160 }}>
            <h3>Chat</h3>
            <ChatBox inline />
          </div>
        </div>

        <SettingsPanel host={host} />
      </div>
    </div>
  );
}
