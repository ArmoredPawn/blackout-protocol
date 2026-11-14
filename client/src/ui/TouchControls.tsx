import { useEffect, useRef, useState } from "react";
import { input } from "../game/input";
import { net } from "../net/connection";
import { useApp } from "../store";
import { game } from "../game/state";
import type { Action } from "../prefs";

export function useTouchMode() {
  const mode = useApp((s) => s.prefs.touchControls);
  const [coarse, setCoarse] = useState(() => {
    try {
      return matchMedia("(pointer: coarse)").matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      const mq = matchMedia("(pointer: coarse)");
      const on = () => setCoarse(mq.matches);
      mq.addEventListener("change", on);
      return () => mq.removeEventListener("change", on);
    } catch {
      return;
    }
  }, []);
  return mode === "on" || (mode === "auto" && coarse);
}

function HoldButton({ action, label, className = "", toggle = false }: { action: Action; label: string; className?: string; toggle?: boolean }) {
  const [on, setOn] = useState(false);
  return (
    <button
      className={`tbtn ${className} ${on ? "on" : ""}`}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        if (toggle) {
          input.emit(action, true);
          setOn((v) => !v);
        } else {
          setOn(true);
          input.setVirtual(action, true);
        }
      }}
      onPointerUp={() => {
        if (!toggle) {
          setOn(false);
          input.setVirtual(action, false);
        }
      }}
      onPointerCancel={() => {
        if (!toggle) {
          setOn(false);
          input.setVirtual(action, false);
        }
      }}
    >
      {label}
    </button>
  );
}

/**
 * Mobile layout: floating joystick on the left, drag-to-look on the right,
 * thumb buttons bottom-right. Designed for thumbs, not a shrunk desktop UI.
 */
export function TouchControls() {
  const role = useApp((s) => (s.snap && s.myId ? s.snap.players[s.myId]?.role : "none"));
  const status = useApp((s) => (s.snap && s.myId ? s.snap.players[s.myId]?.status : ""));
  const stick = useRef<{ id: number; ox: number; oy: number } | null>(null);
  const [knob, setKnob] = useState<{ ox: number; oy: number; x: number; y: number } | null>(null);
  const look = useRef<{ id: number; x: number; y: number; t: number } | null>(null);
  const pinch = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchDist = useRef(0);

  const R = 56;
  const onStickDown = (e: React.PointerEvent) => {
    if (stick.current) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    stick.current = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
    setKnob({ ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY });
  };
  const onStickMove = (e: React.PointerEvent) => {
    const s = stick.current;
    if (!s || s.id !== e.pointerId) return;
    let dx = e.clientX - s.ox,
      dy = e.clientY - s.oy;
    const len = Math.hypot(dx, dy);
    if (len > R) {
      dx = (dx / len) * R;
      dy = (dy / len) * R;
    }
    input.stick.x = dx / R;
    input.stick.y = -dy / R;
    setKnob({ ox: s.ox, oy: s.oy, x: s.ox + dx, y: s.oy + dy });
  };
  const onStickUp = (e: React.PointerEvent) => {
    if (stick.current?.id !== e.pointerId) return;
    stick.current = null;
    input.stick.x = input.stick.y = 0;
    setKnob(null);
  };

  const onLookDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current.size === 2) {
      const [a, b] = [...pinch.current.values()];
      pinchDist.current = Math.hypot(a.x - b.x, a.y - b.y);
      look.current = null;
      return;
    }
    look.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
  };
  const onLookMove = (e: React.PointerEvent) => {
    if (pinch.current.has(e.pointerId)) pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current.size === 2) {
      const [a, b] = [...pinch.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const delta = d - pinchDist.current;
      if (Math.abs(delta) > 12) {
        input.wheel += delta > 0 ? -1 : 1;
        pinchDist.current = d;
      }
      return;
    }
    const l = look.current;
    if (!l || l.id !== e.pointerId) return;
    input.look.dx += (e.clientX - l.x) * 1.6;
    input.look.dy += (e.clientY - l.y) * 1.6;
    l.x = e.clientX;
    l.y = e.clientY;
  };
  const onLookUp = (e: React.PointerEvent) => {
    pinch.current.delete(e.pointerId);
    const l = look.current;
    if (l?.id === e.pointerId) {
      // Quick tap on the look pad = swing for Hunters / switch target when spectating.
      if (performance.now() - l.t < 180) input.lmbClicks++;
      look.current = null;
    }
  };

  useEffect(() => () => input.releaseAll(), []);

  const hunter = role === "hunter";
  return (
    <div className="touch">
      <div className="look-zone" onPointerDown={onLookDown} onPointerMove={onLookMove} onPointerUp={onLookUp} onPointerCancel={onLookUp} />
      <div className="stick-zone" onPointerDown={onStickDown} onPointerMove={onStickMove} onPointerUp={onStickUp} onPointerCancel={onStickUp}>
        {knob && (
          <>
            <div className="stick-base" style={{ left: knob.ox, top: knob.oy - (window.innerHeight * 0.4) }} />
            <div className="stick-knob" style={{ left: knob.x, top: knob.y - (window.innerHeight * 0.4) }} />
          </>
        )}
      </div>
      <div className="tbtns">
        {hunter ? (
          <button
            className="tbtn red"
            onPointerDown={(e) => {
              e.preventDefault();
              net.send("swing", { ry: game.ry });
            }}
          >
            Swing
          </button>
        ) : (
          <HoldButton action="crawlToggle" label="Crawl" toggle />
        )}
        <HoldButton action="jump" label={status === "carried" ? "Struggle" : "Jump"} />
        <HoldButton action="interact" label="Use" className="main" />
        <HoldButton action="ability" label={hunter ? "Power" : "Item"} />
      </div>
    </div>
  );
}
