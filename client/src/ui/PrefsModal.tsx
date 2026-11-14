import { useEffect, useState } from "react";
import { useApp } from "../store";
import { ACTION_LABELS, DEFAULT_BINDINGS, keyLabel, type Action, type Quality } from "../prefs";

type Tab = "controls" | "camera" | "graphics" | "audio" | "data";

function Range({ label, value, min, max, step, onChange, fmt }: { label: string; value: number; min: number; max: number; step: number; onChange(v: number): void; fmt?(v: number): string }) {
  return (
    <div className="slider-row">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="val">{fmt ? fmt(value) : value}</span>
    </div>
  );
}

export function PrefsModal() {
  const show = useApp((s) => s.showPrefs);
  const prefs = useApp((s) => s.prefs);
  const update = useApp((s) => s.updatePrefs);
  const [tab, setTab] = useState<Tab>("controls");
  const [listening, setListening] = useState<Action | null>(null);

  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code !== "Escape") {
        const b = { ...prefs.bindings };
        // A key can only be bound to one action.
        for (const k of Object.keys(b) as Action[]) b[k] = b[k].filter((c) => c !== e.code);
        b[listening] = [e.code, ...b[listening].filter((c) => c !== e.code)].slice(0, 2);
        update({ bindings: b });
      }
      setListening(null);
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [listening, prefs.bindings, update]);

  if (!show) return null;
  const close = () => useApp.setState({ showPrefs: false });
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <div className="overlay" onClick={close} style={{ zIndex: 70 }}>
      <div className="panel modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Settings">
        <div className="row" style={{ marginBottom: 12 }}>
          <h2 className="grow">Settings</h2>
          <button className="btn small" onClick={close}>
            Done
          </button>
        </div>
        <div className="tabs" style={{ marginBottom: 12 }}>
          {(["controls", "camera", "graphics", "audio", "data"] as Tab[]).map((t) => (
            <button key={t} className={`tab ${tab === t ? "on" : ""}`} onClick={() => setTab(t)}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {tab === "controls" && (
          <div className="col" style={{ gap: 4 }}>
            <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
              Defaults follow the familiar layout. <b>Hold right mouse</b> and drag to turn the camera, <b>scroll</b> to zoom and <b>left click</b> to swing as
              Hunter. Click a binding, then press a key.
            </p>
            {(Object.keys(ACTION_LABELS) as Action[]).map((a) => (
              <div key={a} className="row" style={{ padding: "4px 0", borderBottom: "1px solid var(--line)" }}>
                <span className="grow">{ACTION_LABELS[a]}</span>
                <button className={`btn small ${listening === a ? "primary" : ""}`} onClick={() => setListening(a)} style={{ minWidth: 110 }}>
                  {listening === a ? "Press a key…" : prefs.bindings[a].map(keyLabel).join(" / ") || "Unbound"}
                </button>
              </div>
            ))}
            <div className="row" style={{ marginTop: 8 }}>
              <span className="grow">Touch controls</span>
              <div className="tabs">
                {(["auto", "on", "off"] as const).map((m) => (
                  <button key={m} className={`tab ${prefs.touchControls === m ? "on" : ""}`} onClick={() => update({ touchControls: m })}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <button className="btn small ghost" style={{ alignSelf: "flex-start", marginTop: 8 }} onClick={() => update({ bindings: { ...DEFAULT_BINDINGS } })}>
              Reset key bindings
            </button>
          </div>
        )}

        {tab === "camera" && (
          <>
            <Range label="Sensitivity" value={prefs.sensitivity} min={0.2} max={3} step={0.05} onChange={(v) => update({ sensitivity: v })} fmt={(v) => `${v.toFixed(2)}×`} />
            <Range label="Field of view" value={prefs.fov} min={55} max={95} step={1} onChange={(v) => update({ fov: v })} fmt={(v) => `${v}°`} />
            <div className="row" style={{ padding: "6px 0" }}>
              <span className="grow">Invert vertical look</span>
              <button className={`toggle ${prefs.invertY ? "on" : ""}`} onClick={() => update({ invertY: !prefs.invertY })} aria-label="Invert Y" />
            </div>
          </>
        )}

        {tab === "graphics" && (
          <>
            <div className="row" style={{ padding: "6px 0" }}>
              <span className="grow">
                Quality
                <div className="muted" style={{ fontSize: 12 }}>Low turns off shadows and anti-aliasing. Best for laptops without a graphics card and for phones.</div>
              </span>
              <div className="tabs">
                {(["low", "medium", "high"] as Quality[]).map((q) => (
                  <button key={q} className={`tab ${prefs.quality === q ? "on" : ""}`} onClick={() => update({ quality: q })}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {tab === "audio" && (
          <>
            <Range label="Master" value={prefs.master} min={0} max={1} step={0.01} onChange={(v) => update({ master: v })} fmt={pct} />
            <Range label="Effects" value={prefs.sfx} min={0} max={1} step={0.01} onChange={(v) => update({ sfx: v })} fmt={pct} />
            <Range label="Ambience" value={prefs.ambience} min={0} max={1} step={0.01} onChange={(v) => update({ ambience: v })} fmt={pct} />
            <div className="row" style={{ padding: "6px 0" }}>
              <span className="grow">Mute all</span>
              <button className={`toggle ${prefs.muted ? "on" : ""}`} onClick={() => update({ muted: !prefs.muted })} aria-label="Mute" />
            </div>
          </>
        )}

        {tab === "data" && (
          <div className="col">
            <p style={{ marginTop: 0, lineHeight: 1.55 }}>
              Blackout Protocol has <b>no accounts</b>. Your display name, avatar, key bindings and graphics/audio settings are stored in this browser&apos;s local
              storage only:
            </p>
            <ul className="muted" style={{ lineHeight: 1.6, marginTop: 0 }}>
              <li>They do <b>not</b> sync to your other devices or browsers.</li>
              <li>Private/incognito windows forget them when closed.</li>
              <li>Clearing site data removes them permanently.</li>
              <li>The server gets a random temporary ID each time you join. It doesn&apos;t keep any profile.</li>
            </ul>
            <button
              className="btn danger small"
              style={{ alignSelf: "flex-start" }}
              onClick={() => {
                if (!confirm("Erase your saved name, avatar and settings from this browser?")) return;
                try {
                  localStorage.clear();
                } catch {
                  /* ignore */
                }
                location.reload();
              }}
            >
              Erase local data
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
