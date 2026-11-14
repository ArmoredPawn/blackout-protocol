import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  BUILTIN_MAPS,
  MAX_FLOORS,
  MAX_MAP_D,
  MAX_MAP_W,
  PROPS,
  TIER_LABELS,
  decodeMapCode,
  encodeMapCode,
  validateMap,
  type EntityType,
  type MapDefinition,
  type ThemeId,
} from "@bp/shared";
import { useApp } from "../store";
import { net } from "../net/connection";
import { drawEditor } from "./draw";
import {
  OBJECT_TOOLS,
  addFloor,
  autoRot,
  blankMap,
  clone,
  entityAt,
  exitRot,
  paint,
  placeEntity,
  rectCells,
  removeEntityAt,
  removeFloor,
  resize,
  room,
  rotateEntityAt,
} from "./model";
import { deleteSavedMap, downloadJson, loadSavedMaps, newKey, saveMap, type SavedMap } from "./storage";
import { Preview3D } from "./Preview3D";

type Tool =
  | { kind: "tile"; ch: string }
  | { kind: "room"; ch: string }
  | { kind: "rect"; ch: string }
  | { kind: "obj"; t: EntityType }
  | { kind: "prop"; k: string }
  | { kind: "rotate" }
  | { kind: "erase" }
  | { kind: "pan" };

const TILES: { ch: string; label: string; color: string; hint: string }[] = [
  { ch: ".", label: "Floor", color: "#3a4558", hint: "Main floor" },
  { ch: ",", label: "Floor B", color: "#4a5a76", hint: "Alternate floor material" },
  { ch: ":", label: "Grate", color: "#2c3442", hint: "Metal grate floor" },
  { ch: "#", label: "Wall", color: "#aab6cc", hint: "Full-height wall" },
  { ch: "G", label: "Glass", color: "#5aa8d8", hint: "Blocks movement, not vision" },
  { ch: "W", label: "Low wall", color: "#7c88a0", hint: "Waist high – can be jumped onto" },
  { ch: "D", label: "Doorway", color: "#c08a50", hint: "Opening in a wall" },
  { ch: "V", label: "Vent", color: "#20262f", hint: "Crawl-only passage" },
  { ch: "1", label: "Seal (M)", color: "#d4a017", hint: "Wall that opens for 6+ players" },
  { ch: "2", label: "Seal (L)", color: "#d48a17", hint: "Wall that opens for 11+ players" },
  { ch: "3", label: "Seal (XL)", color: "#d46a17", hint: "Wall that opens for 16+ players" },
  { ch: " ", label: "Empty", color: "#0b0f17", hint: "No floor (outside / open to below)" },
];

const THEMES: ThemeId[] = ["facility", "industrial", "school", "underground", "mall", "warehouse", "custom"];
const PROP_GROUPS = ["furniture", "storage", "tech", "industrial", "decor", "structure"] as const;

function useHistory(initial: MapDefinition) {
  const [map, setMap] = useState(initial);
  const undo = useRef<MapDefinition[]>([]);
  const redo = useRef<MapDefinition[]>([]);
  const commit = useCallback((next: MapDefinition, push = true) => {
    setMap((cur) => {
      if (push) {
        undo.current.push(cur);
        if (undo.current.length > 80) undo.current.shift();
        redo.current = [];
      }
      return next;
    });
  }, []);
  const doUndo = useCallback(() => {
    setMap((cur) => {
      const prev = undo.current.pop();
      if (!prev) return cur;
      redo.current.push(cur);
      return prev;
    });
  }, []);
  const doRedo = useCallback(() => {
    setMap((cur) => {
      const next = redo.current.pop();
      if (!next) return cur;
      undo.current.push(cur);
      return next;
    });
  }, []);
  const reset = useCallback((m: MapDefinition) => {
    undo.current = [];
    redo.current = [];
    setMap(m);
  }, []);
  return { map, commit, doUndo, doRedo, reset, setMap };
}

export function MapEditor() {
  const toast = useApp((s) => s.toast);
  const { map, commit, doUndo, doRedo, reset, setMap } = useHistory(blankMap());
  const [key, setKey] = useState(newKey());
  const [dirty, setDirty] = useState(false);
  const [floor, setFloor] = useState(0);
  const [tool, setTool] = useState<Tool>({ kind: "room", ch: "." });
  const [lightColor, setLightColor] = useState("#fff4dc");
  const [view, setView] = useState<"2d" | "3d">("2d");
  const [tier, setTier] = useState(3);
  const [panel, setPanel] = useState<"tools" | "props" | "map">("tools");
  const [library, setLibrary] = useState(true);
  const [cam, setCam] = useState({ cs: 22, ox: 20, oy: 20 });
  const [hover, setHover] = useState<{ x: number; z: number } | null>(null);
  const [rect, setRect] = useState<{ x0: number; z0: number; x1: number; z1: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null!);
  const wrapRef = useRef<HTMLDivElement>(null!);
  const drag = useRef<{ mode: "paint" | "rect" | "pan"; lx: number; lz: number; px: number; py: number; base: MapDefinition } | null>(null);
  const deferred = useDeferredValue(map);
  const validation = useMemo(() => validateMap(deferred), [deferred]);

  const edit = useCallback(
    (next: MapDefinition, push = true) => {
      commit(next, push);
      setDirty(true);
    },
    [commit],
  );

  // ── canvas rendering ──
  useEffect(() => {
    if (view !== "2d") return;
    const c = canvasRef.current,
      w = wrapRef.current;
    if (!c || !w) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = w.getBoundingClientRect();
    if (c.width !== Math.round(r.width * dpr) || c.height !== Math.round(r.height * dpr)) {
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
    }
    drawEditor(c.getContext("2d")!, map, { floor, ...cam, hover, rect, dpr });
  });
  useEffect(() => {
    const onResize = () => setCam((c) => ({ ...c }));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const fit = useCallback(() => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    const cs = Math.max(6, Math.min(40, Math.floor(Math.min((r.width - 40) / map.width, (r.height - 40) / map.depth))));
    setCam({ cs, ox: (r.width - cs * map.width) / 2, oy: (r.height - cs * map.depth) / 2 });
  }, [map.width, map.depth]);

  const cellAt = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left - cam.ox) / cam.cs);
    const z = Math.floor((e.clientY - r.top - cam.oy) / cam.cs);
    return x >= 0 && z >= 0 && x < map.width && z < map.depth ? { x, z } : null;
  };

  const applyAt = (base: MapDefinition, x: number, z: number): MapDefinition => {
    switch (tool.kind) {
      case "tile":
        return paint(base, floor, [[x, z]], tool.ch);
      case "obj": {
        if (tool.t === "exit") return placeEntity(base, { t: "exit", f: floor, x, z, r: exitRot(base, floor, x, z) });
        if (tool.t === "light") return placeEntity(base, { t: "light", f: floor, x, z, c: lightColor });
        if (tool.t === "stairs") return placeEntity(base, { t: "stairs", f: floor, x, z, r: 0 });
        return placeEntity(base, { t: tool.t, f: floor, x, z, r: autoRot(base, floor, x, z) });
      }
      case "prop":
        return placeEntity(base, { t: "prop", f: floor, x, z, k: tool.k, r: autoRot(base, floor, x, z) });
      case "rotate":
        return rotateEntityAt(base, floor, x, z);
      case "erase":
        return removeEntityAt(base, floor, x, z);
      default:
        return base;
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const c = cellAt(e);
    const panning = e.button === 1 || e.button === 2 || tool.kind === "pan" || (e.button === 0 && e.altKey);
    if (panning) {
      drag.current = { mode: "pan", lx: 0, lz: 0, px: e.clientX, py: e.clientY, base: map };
      return;
    }
    if (!c || e.button !== 0) return;
    if (tool.kind === "room" || tool.kind === "rect" || (tool.kind === "tile" && e.shiftKey)) {
      drag.current = { mode: "rect", lx: c.x, lz: c.z, px: 0, py: 0, base: map };
      setRect({ x0: c.x, z0: c.z, x1: c.x, z1: c.z });
      return;
    }
    const next = applyAt(map, c.x, c.z);
    edit(next);
    drag.current = { mode: "paint", lx: c.x, lz: c.z, px: 0, py: 0, base: next };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const c = cellAt(e);
    setHover(c);
    const d = drag.current;
    if (!d) return;
    if (d.mode === "pan") {
      setCam((cm) => ({ ...cm, ox: cm.ox + e.clientX - d.px, oy: cm.oy + e.clientY - d.py }));
      d.px = e.clientX;
      d.py = e.clientY;
      return;
    }
    if (!c) return;
    if (d.mode === "rect") {
      setRect({ x0: d.lx, z0: d.lz, x1: c.x, z1: c.z });
      return;
    }
    if (tool.kind !== "tile" || (c.x === d.lx && c.z === d.lz)) return;
    // Interpolate so fast strokes don't leave gaps.
    const cells: [number, number][] = [];
    const steps = Math.max(Math.abs(c.x - d.lx), Math.abs(c.z - d.lz));
    for (let i = 1; i <= steps; i++) cells.push([Math.round(d.lx + ((c.x - d.lx) * i) / steps), Math.round(d.lz + ((c.z - d.lz) * i) / steps)]);
    d.lx = c.x;
    d.lz = c.z;
    setMap((cur) => paint(cur, floor, cells, tool.ch));
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.mode === "rect" && rect) {
      const cells = rectCells(rect.x0, rect.z0, rect.x1, rect.z1);
      if (tool.kind === "room") edit(room(map, floor, rect.x0, rect.z0, rect.x1, rect.z1, tool.ch));
      else if (tool.kind === "rect" || tool.kind === "tile") edit(paint(map, floor, cells, tool.ch));
      setRect(null);
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    const r = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - r.left,
      my = e.clientY - r.top;
    setCam((c) => {
      const cs = Math.max(5, Math.min(60, c.cs * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
      const k = cs / c.cs;
      return { cs, ox: mx - (mx - c.ox) * k, oy: my - (my - c.oy) * k };
    });
  };

  // ── keyboard shortcuts ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) doRedo();
        else doUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        doRedo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        doSave();
      } else if (e.key.toLowerCase() === "r" && hover) edit(rotateEntityAt(map, floor, hover.x, hover.z));
      else if ((e.key === "Delete" || e.key === "Backspace") && hover) edit(removeEntityAt(map, floor, hover.x, hover.z));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ── persistence ──
  const doSave = () => {
    if (saveMap(key, map)) {
      setDirty(false);
      toast(`Saved "${map.name}" in this browser`, "good");
    } else toast("Couldn't save: browser storage is full or unavailable.", "bad");
  };

  const openMap = (m: MapDefinition, k = newKey()) => {
    if (dirty && !confirm("Discard unsaved changes?")) return;
    reset(clone(m));
    setKey(k);
    setDirty(false);
    setFloor(0);
    setLibrary(false);
    setTimeout(fit, 0);
  };

  const importText = async (text: string) => {
    try {
      const data = text.trim().startsWith("BPM1.") ? await decodeMapCode(text) : JSON.parse(text);
      const v = validateMap(data);
      if (!v.map) return toast(`Can't open that map: ${v.errors[0] ?? "invalid data"}`, "bad");
      openMap({ ...v.map, id: "custom" });
      if (!v.ok) toast("Map opened. It still needs fixes before it can be played.", "warn");
    } catch {
      toast("That isn't a valid map file or code.", "bad");
    }
  };

  const shareCode = async () => {
    try {
      const code = await encodeMapCode(map);
      await navigator.clipboard.writeText(code);
      toast(`Share code copied (${Math.round(code.length / 1000)}k characters)`, "good");
    } catch {
      toast("Couldn't copy the share code. Try Export file instead.", "bad");
    }
  };

  const useInRoom = () => {
    if (!validation.ok || !validation.map) return toast("Fix the problems listed under Checks first.", "warn");
    net.send("customMap", JSON.stringify(validation.map));
    toast("Sent to your room. Pick it in the lobby's Map tab.", "good");
  };

  const inRoomAsHost = useApp((s) => !!s.snap && s.snap.hostId === s.myId && (s.snap.phase === "lobby" || s.snap.phase === "intermission"));
  const t0 = validation.tiers?.[0];

  const toolBtn = (t: Tool, label: string, color?: string, title?: string) => {
    const on = JSON.stringify(t) === JSON.stringify(tool);
    return (
      <button key={label} className={`opt ${on ? "on" : ""}`} style={{ textTransform: "none", display: "flex", alignItems: "center", gap: 6 }} title={title} onClick={() => setTool(t)}>
        {color && <span style={{ width: 12, height: 12, borderRadius: 3, background: color, border: "1px solid rgba(255,255,255,.25)" }} />}
        {label}
      </button>
    );
  };

  return (
    <div className="editor-screen">
      <div className="editor-top panel">
        <button className="btn small ghost" onClick={() => (!dirty || confirm("Leave without saving?")) && useApp.setState({ screen: "home" })}>
          ← Back
        </button>
        <input className="input" style={{ maxWidth: 240 }} value={map.name} maxLength={40} onChange={(e) => edit({ ...map, name: e.target.value }, false)} aria-label="Map name" />
        <span className="muted" style={{ fontSize: 12 }}>{dirty ? "Unsaved changes" : "Saved"}</span>
        <span className="grow" />
        <button className="btn small" onClick={doUndo} title="Undo (Ctrl+Z)">Undo</button>
        <button className="btn small" onClick={doRedo} title="Redo (Ctrl+Y)">Redo</button>
        <div className="tabs" style={{ flex: "none" }}>
          <button className={`tab ${view === "2d" ? "on" : ""}`} onClick={() => setView("2d")}>Build</button>
          <button className={`tab ${view === "3d" ? "on" : ""}`} onClick={() => setView("3d")}>3D preview</button>
        </div>
        <button className="btn small" onClick={() => setLibrary(true)}>My maps</button>
        <button className="btn small primary" onClick={doSave}>Save</button>
      </div>

      <div className="editor-side-l panel">
        <div className="tabs">
          {(["tools", "props", "map"] as const).map((p) => (
            <button key={p} className={`tab ${panel === p ? "on" : ""}`} onClick={() => setPanel(p)}>
              {p === "tools" ? "Build" : p === "props" ? "Furniture" : "Map"}
            </button>
          ))}
        </div>
        <div className="editor-scroll col" style={{ gap: 14, padding: "12px 2px" }}>
          {panel === "tools" && (
            <>
              <div className="col" style={{ gap: 6 }}>
                <span className="label">Draw a room</span>
                <div className="opts">
                  {toolBtn({ kind: "room", ch: "." }, "Room", "#3a4558", "Drag a rectangle: walls around, floor inside")}
                  {toolBtn({ kind: "room", ch: "," }, "Room (floor B)", "#4a5a76")}
                  {toolBtn({ kind: "room", ch: ":" }, "Room (grate)", "#2c3442")}
                </div>
              </div>
              <div className="col" style={{ gap: 6 }}>
                <span className="label">Paint blocks (Shift-drag fills a rectangle)</span>
                <div className="opts">{TILES.map((t) => toolBtn({ kind: "tile", ch: t.ch }, t.label, t.color, t.hint))}</div>
              </div>
              <div className="col" style={{ gap: 6 }}>
                <span className="label">Gameplay objects</span>
                <div className="opts">{OBJECT_TOOLS.map((o) => toolBtn({ kind: "obj", t: o.t }, o.label, o.color, o.hint))}</div>
                {tool.kind === "obj" && tool.t === "light" && (
                  <label className="row" style={{ fontSize: 13 }}>
                    Light colour <input type="color" value={lightColor} onChange={(e) => setLightColor(e.target.value)} className="swatch-custom" />
                  </label>
                )}
                {tool.kind === "obj" && tool.t === "stairs" && (
                  <span className="muted" style={{ fontSize: 12 }}>Place, then rotate (R) to point uphill. Clear the 3 cells above on the next floor with Empty.</span>
                )}
              </div>
              <div className="col" style={{ gap: 6 }}>
                <span className="label">Edit</span>
                <div className="opts">
                  {toolBtn({ kind: "rotate" }, "Rotate object (R)")}
                  {toolBtn({ kind: "erase" }, "Remove object (Del)")}
                  {toolBtn({ kind: "pan" }, "Move view")}
                </div>
                <span className="muted" style={{ fontSize: 12 }}>Right-drag or Alt-drag moves the view. Scroll to zoom.</span>
              </div>
            </>
          )}
          {panel === "props" &&
            PROP_GROUPS.map((g) => (
              <div key={g} className="col" style={{ gap: 6 }}>
                <span className="label">{g}</span>
                <div className="opts">
                  {Object.entries(PROPS)
                    .filter(([, p]) => p.category === g)
                    .map(([k, p]) => toolBtn({ kind: "prop", k }, p.label, p.solid ? "#c8a06e" : "#96c896", p.solid ? "Blocks movement" : "Decoration only"))}
                </div>
              </div>
            ))}
          {panel === "map" && (
            <MapSettings map={map} onChange={(m) => edit(m)} />
          )}
        </div>
      </div>

      <div className="editor-canvas panel" ref={wrapRef}>
        {view === "2d" ? (
          <>
            <canvas
              ref={canvasRef}
              style={{ width: "100%", height: "100%", display: "block", touchAction: "none", cursor: tool.kind === "pan" ? "grab" : "crosshair" }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onPointerLeave={() => setHover(null)}
              onWheel={onWheel}
              onContextMenu={(e) => e.preventDefault()}
            />
            <div className="editor-floorbar">
              {map.floors.map((_, f) => (
                <button key={f} className={`btn small ${floor === f ? "primary" : ""}`} onClick={() => setFloor(f)}>
                  {f === 0 ? "Ground" : `Floor ${f + 1}`}
                </button>
              ))}
              {map.floors.length < MAX_FLOORS && (
                <button className="btn small ghost" onClick={() => { edit(addFloor(map)); setFloor(map.floors.length); }}>+ Floor</button>
              )}
              {floor > 0 && (
                <button className="btn small danger" onClick={() => confirm("Delete this floor?") && (edit(removeFloor(map, floor)), setFloor(floor - 1))}>
                  Delete floor
                </button>
              )}
              <button className="btn small ghost" onClick={fit}>Fit</button>
              {hover && <span className="muted" style={{ fontSize: 12 }}>{hover.x}, {hover.z}{entityAt(map, floor, hover.x, hover.z) ? ` · ${entityAt(map, floor, hover.x, hover.z)!.k ?? entityAt(map, floor, hover.x, hover.z)!.t}` : ""}</span>}
            </div>
          </>
        ) : (
          <>
            <Preview3D map={map} tier={tier} />
            <div className="editor-floorbar">
              {TIER_LABELS.map((l, i) => (
                <button key={l} className={`btn small ${tier === i ? "primary" : ""}`} onClick={() => setTier(i)}>
                  {l}
                </button>
              ))}
              <span className="muted" style={{ fontSize: 12 }}>Drag to orbit · right-drag to pan · scroll to zoom</span>
            </div>
          </>
        )}
      </div>

      <div className="editor-side-r panel">
        <h3>Checks</h3>
        {validation.ok ? <span className="chip good">Playable</span> : <span className="chip warn">Needs fixes</span>}
        <ul className="check-list">
          {validation.errors.map((e) => (
            <li key={e} style={{ color: "#ffb3bb" }}>{e}</li>
          ))}
          {validation.warnings.map((w) => (
            <li key={w} className="muted">{w}</li>
          ))}
          {validation.ok && !validation.warnings.length && <li className="muted">Everything a match needs is in place.</li>}
        </ul>
        {validation.tiers && (
          <table className="results-table" style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th>Size</th>
                <th>Term.</th>
                <th>Pods</th>
                <th>Exits</th>
              </tr>
            </thead>
            <tbody>
              {validation.tiers.map((t, i) => (
                <tr key={i}>
                  <td>{TIER_LABELS[i].split(" ")[0]}</td>
                  <td>{t.terminals}</td>
                  <td>{t.pods}</td>
                  <td>{t.exits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {t0 && <p className="muted" style={{ fontSize: 12 }}>Only objects reachable from the first Survivor spawn count. Seal walls (M/L/XL) hide wings in smaller games.</p>}
        <h3 style={{ marginTop: 6 }}>Share</h3>
        <div className="col" style={{ gap: 6 }}>
          <button className="btn small" onClick={shareCode}>Copy share code</button>
          <button className="btn small" onClick={() => downloadJson(map)}>Export file</button>
          {inRoomAsHost && (
            <button className="btn small primary" onClick={useInRoom} disabled={!validation.ok}>
              Use in my room
            </button>
          )}
        </div>
        <p className="muted" style={{ fontSize: 12 }}>Maps are saved in this browser only. Send friends the file or share code to play them on their device.</p>
      </div>

      {library && <Library onOpen={openMap} onImport={importText} onClose={() => setLibrary(false)} />}
    </div>
  );
}

function MapSettings({ map, onChange }: { map: MapDefinition; onChange(m: MapDefinition): void }) {
  const [w, setW] = useState(map.width);
  const [d, setD] = useState(map.depth);
  useEffect(() => {
    setW(map.width);
    setD(map.depth);
  }, [map.width, map.depth]);
  const L = map.lighting;
  const setL = (patch: Partial<MapDefinition["lighting"]>) => onChange({ ...map, lighting: { ...L, ...patch } });
  const range = (label: string, value: number, min: number, max: number, step: number, set: (v: number) => void) => (
    <div className="slider-row" style={{ gridTemplateColumns: "1fr 1.2fr 44px" }}>
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(Number(e.target.value))} />
      <span className="val">{value}</span>
    </div>
  );
  return (
    <>
      <div className="col" style={{ gap: 6 }}>
        <span className="label">Description</span>
        <textarea className="input" rows={2} maxLength={200} value={map.description ?? ""} onChange={(e) => onChange({ ...map, description: e.target.value })} />
        <span className="label">Author</span>
        <input className="input" maxLength={30} value={map.author ?? ""} onChange={(e) => onChange({ ...map, author: e.target.value })} />
      </div>
      <div className="col" style={{ gap: 6 }}>
        <span className="label">Size (cells, 1 cell = 2 m)</span>
        <div className="row">
          <input className="input" type="number" min={12} max={MAX_MAP_W} value={w} onChange={(e) => setW(Number(e.target.value))} aria-label="Width" />
          ×
          <input className="input" type="number" min={12} max={MAX_MAP_D} value={d} onChange={(e) => setD(Number(e.target.value))} aria-label="Depth" />
          <button className="btn small" onClick={() => onChange(resize(map, w, d))}>Apply</button>
        </div>
      </div>
      <div className="col" style={{ gap: 6 }}>
        <span className="label">Theme</span>
        <select className="input" value={map.theme} onChange={(e) => onChange({ ...map, theme: e.target.value as ThemeId })}>
          {THEMES.map((t) => (
            <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>
          ))}
        </select>
      </div>
      <div className="col" style={{ gap: 4 }}>
        <span className="label">Lighting</span>
        <label className="row" style={{ fontSize: 13 }}>
          <span className="grow">Ambient colour</span>
          <input type="color" className="swatch-custom" value={L.ambient} onChange={(e) => setL({ ambient: e.target.value })} />
        </label>
        {range("Ambient", L.ambientIntensity, 0, 2, 0.05, (v) => setL({ ambientIntensity: v }))}
        {range("Lamps", L.lamp, 0, 4, 0.1, (v) => setL({ lamp: v }))}
        <label className="row" style={{ fontSize: 13 }}>
          <span className="grow">Fog colour</span>
          <input type="color" className="swatch-custom" value={L.fog} onChange={(e) => setL({ fog: e.target.value })} />
        </label>
        {range("Fog", L.fogDensity, 0, 0.08, 0.002, (v) => setL({ fogDensity: v }))}
        <label className="row" style={{ fontSize: 13 }}>
          <span className="grow">Sky / void colour</span>
          <input type="color" className="swatch-custom" value={L.sky} onChange={(e) => setL({ sky: e.target.value })} />
        </label>
      </div>
    </>
  );
}

function Library({ onOpen, onImport, onClose }: { onOpen(m: MapDefinition, key?: string): void; onImport(text: string): void; onClose(): void }) {
  const [saved, setSaved] = useState<SavedMap[]>(() => loadSavedMaps());
  const [code, setCode] = useState("");
  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel modal" style={{ width: "min(760px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ marginBottom: 12 }}>
          <h2 className="grow">Map editor</h2>
          <button className="btn small" onClick={onClose}>Close</button>
        </div>
        <div className="label" style={{ marginBottom: 6 }}>Start a new map</div>
        <div className="opts" style={{ marginBottom: 14 }}>
          <button className="opt on" style={{ textTransform: "none" }} onClick={() => onOpen(blankMap("My Map"))}>Blank (small)</button>
          <button className="opt" style={{ textTransform: "none" }} onClick={() => onOpen(blankMap("My Big Map", 56, 44))}>Blank (large)</button>
          {BUILTIN_MAPS.map((m) => (
            <button key={m.id} className="opt" style={{ textTransform: "none" }} onClick={() => onOpen({ ...clone(m), id: "custom", name: `${m.name} (copy)`, author: "" })}>
              Copy of {m.name}
            </button>
          ))}
        </div>
        <div className="label" style={{ marginBottom: 6 }}>Saved in this browser</div>
        {saved.length === 0 && <p className="muted" style={{ marginTop: 0 }}>No saved maps yet.</p>}
        <div className="col" style={{ gap: 6, marginBottom: 14 }}>
          {saved.map((s) => {
            const ok = validateMap(s.map).ok;
            return (
              <div key={s.key} className="player-row">
                <span className="grow" style={{ fontWeight: 600 }}>{s.map.name}</span>
                <span className={`chip ${ok ? "good" : "warn"}`}>{ok ? "Playable" : "Draft"}</span>
                <span className="muted" style={{ fontSize: 12 }}>{new Date(s.updatedAt).toLocaleDateString()}</span>
                <button className="btn small" onClick={() => onOpen(s.map, s.key)}>Open</button>
                <button
                  className="btn small danger"
                  onClick={() => {
                    if (!confirm(`Delete "${s.map.name}"?`)) return;
                    deleteSavedMap(s.key);
                    setSaved(loadSavedMaps());
                  }}
                >
                  Delete
                </button>
              </div>
            );
          })}
        </div>
        <div className="label" style={{ marginBottom: 6 }}>Import</div>
        <div className="row wrap">
          <label className="btn small">
            Open map file
            <input
              type="file"
              accept=".json,application/json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f && f.size < 400_000) onImport(await f.text());
                e.target.value = "";
              }}
            />
          </label>
          <input className="input grow" placeholder="…or paste a share code (BPM1.…)" value={code} onChange={(e) => setCode(e.target.value)} />
          <button className="btn small" disabled={!code.trim()} onClick={() => onImport(code)}>Open code</button>
        </div>
      </div>
    </div>
  );
}
