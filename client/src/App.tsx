import { useEffect, useState } from "react";
import { normalizeRoomCode } from "@bp/shared";
import { net, serverUrl } from "./net/connection";
import { useApp } from "./store";
import { GameCanvas } from "./game/GameCanvas";
import { input } from "./game/input";
import { audio } from "./game/audio";
import { Home } from "./ui/Home";
import { AvatarEditor } from "./ui/AvatarEditor";
import { MapEditor } from "./editor/MapEditor";
import { Lobby } from "./ui/Lobby";
import { Hud } from "./ui/Hud";
import { PrefsModal } from "./ui/PrefsModal";
import { TouchControls, useTouchMode } from "./ui/TouchControls";

function Toasts() {
  const toasts = useApp((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

/** Reads the invite link (#/join/CODE) or resumes a session after reload (#/room/CODE). */
let routed = false;

function useRouting() {
  const [booting, setBooting] = useState(!routed);
  useEffect(() => {
    const parse = async () => {
      if (routed) return setBooting(false);
      routed = true;
      const m = /^#\/(join|room)\/([A-Za-z0-9-]+)/.exec(location.hash);
      const code = m ? normalizeRoomCode(m[2]) : null;
      if (m?.[1] === "room") {
        const resumed = await net.tryResume();
        if (!resumed && code) useApp.setState({ inviteCode: code });
      } else if (code) {
        useApp.setState({ inviteCode: code });
        if (useApp.getState().prefs.name.trim()) {
          // Returning players with a saved name join straight from the invite link.
          net.joinRoom(code).catch(() => {});
        }
      }
      setBooting(false);
    };
    void parse();
    const onHash = () => {
      const m = /^#\/join\/([A-Za-z0-9-]+)/.exec(location.hash);
      const code = m ? normalizeRoomCode(m[1]) : null;
      if (code && !net.room) useApp.setState({ inviteCode: code });
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return booting;
}

export function App() {
  const booting = useRouting();
  const screen = useApp((s) => s.screen);
  const phase = useApp((s) => s.snap?.phase);
  const conn = useApp((s) => s.conn);
  const touch = useTouchMode();
  useEffect(() => {
    // Wake the game server early: free hosting tiers sleep when idle and take ~1 min to start.
    fetch(`${serverUrl()}/health`, { mode: "cors", cache: "no-store" }).catch(() => {});
    input.attach();
    const unlock = () => audio.init();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
  }, []);

  const inGame = phase === "headstart" || phase === "playing" || phase === "results";
  // A round starting pulls everyone out of the avatar/map editors.
  useEffect(() => {
    if (phase === "headstart" && (useApp.getState().screen === "avatar" || useApp.getState().screen === "editor")) {
      useApp.setState({ screen: "room" });
      useApp.getState().toast("The round is starting!", "info");
    }
  }, [phase]);
  let body: React.ReactNode;
  if (screen === "avatar") body = <AvatarEditor />;
  else if (screen === "editor") body = <MapEditor />;
  else if (phase && inGame)
    body = (
      <>
        <GameCanvas />
        <Hud />
        {touch && phase !== "results" && <TouchControls />}
      </>
    );
  else if (phase) body = <Lobby />;
  else body = <Home />;

  return (
    <div className="app">
      {(!inGame || screen === "editor" || screen === "avatar") && <div className="backdrop" />}
      {body}
      <Toasts />
      <PrefsModal />
      {(booting || (conn === "connecting" && !phase)) && (
        <div className="loading">
          <div className="col" style={{ alignItems: "center", gap: 14 }}>
            <div className="spinner" />
            <span className="muted">{booting ? "Loading…" : "Connecting to the game server…"}</span>
          </div>
        </div>
      )}
    </div>
  );
}
