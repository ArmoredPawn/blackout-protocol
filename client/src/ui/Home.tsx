import { useEffect, useState } from "react";
import { MAX_NAME_LEN, formatRoomCode, normalizeRoomCode } from "@bp/shared";
import { net } from "../net/connection";
import { useApp } from "../store";
import { audio } from "../game/audio";
import { AvatarPreview } from "./AvatarPreview";
import { Icon } from "./Icon";

export function Home() {
  const prefs = useApp((s) => s.prefs);
  const updatePrefs = useApp((s) => s.updatePrefs);
  const conn = useApp((s) => s.conn);
  const invite = useApp((s) => s.inviteCode);
  const [code, setCode] = useState(invite ? formatRoomCode(invite) : "");
  const [busy, setBusy] = useState<"" | "create" | "join">("");
  useEffect(() => {
    if (invite) setCode(formatRoomCode(invite));
  }, [invite]);

  const nameOk = prefs.name.trim().length > 0;
  const parsed = normalizeRoomCode(code);

  const go = async (kind: "create" | "join") => {
    audio.init();
    if (!nameOk) return useApp.getState().toast("Pick a display name first.", "warn");
    setBusy(kind);
    try {
      if (kind === "create") await net.createRoom();
      else if (parsed) await net.joinRoom(parsed);
    } catch {
      /* toast already shown */
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="screen">
      <div className="home">
        <div>
          <div className="brand">
            BLACKOUT
            <br />
            <span>PROTOCOL</span>
          </div>
          <p className="tagline">
            A private hunt-and-escape game for you and up to 19 friends. Hack terminals, power the exits and get out before the Hunter puts you in a stasis pod.
            It runs in your browser, with no downloads and no accounts.
          </p>
          <div className="feature-list">
            <div className="feature">
              <b>Private rooms only</b>Every game is invite-only via an 8-character code or link.
            </div>
            <div className="feature">
              <b>2–20 players</b>Maps grow with your lobby: more wings, terminals and exits.
            </div>
            <div className="feature">
              <b>14 powerups</b>The host picks which Hunter and Survivor powers are allowed.
            </div>
            <div className="feature">
              <b>Your own character</b>Build a block avatar. It&apos;s saved in this browser.
            </div>
          </div>
        </div>

        <div className="panel home-card">
          <div className="avatar-stage">
            <AvatarPreview avatar={prefs.avatar} />
            <button className="btn small" style={{ position: "absolute", right: 10, bottom: 10 }} onClick={() => useApp.setState({ screen: "avatar" })}>
              <Icon name="user" size={16} /> Customize
            </button>
          </div>
          <label className="col" style={{ gap: 6 }}>
            <span className="label">Display name</span>
            <input
              className="input"
              maxLength={MAX_NAME_LEN}
              placeholder="Your name"
              value={prefs.name}
              onChange={(e) => updatePrefs({ name: e.target.value })}
              autoComplete="off"
            />
          </label>
          <button className="btn primary big" disabled={!!busy || conn === "connecting"} onClick={() => go("create")}>
            {busy === "create" ? "Creating…" : "Create private room"}
          </button>
          <div className="divider">or join with a code</div>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              void go("join");
            }}
          >
            <input
              className="input code-input grow"
              placeholder="ABCD-EFGH"
              value={code}
              maxLength={9}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))}
              aria-label="Room code"
              autoComplete="off"
              spellCheck={false}
            />
            <button className="btn big" disabled={!parsed || !!busy} type="submit">
              {busy === "join" ? "Joining…" : "Join"}
            </button>
          </form>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <button className="btn ghost small" onClick={() => useApp.setState({ showPrefs: true })}>
              <Icon name="gear" size={16} /> Settings & controls
            </button>
            <button className="btn ghost small" onClick={() => useApp.setState({ screen: "editor" })}>
              <Icon name="map" size={16} /> Map editor
            </button>
          </div>
          <p className="local-note">
            No account needed. Your name, avatar and settings are saved <b>only in this browser</b>. They won&apos;t appear on other devices or browsers, and
            clearing site data deletes them.
          </p>
        </div>
      </div>
    </div>
  );
}
