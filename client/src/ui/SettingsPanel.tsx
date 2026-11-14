import { useRef, useState } from "react";
import {
  BUILTIN_MAPS,
  DEFAULT_SETTINGS,
  HUNTER_POWERUPS,
  NUMBER_FIELDS,
  SURVIVOR_POWERUPS,
  TIER_LABELS,
  decodeMapCode,
  effectiveHunterCount,
  tierForPlayers,
  validateMap,
  type PowerupDef,
  type RoomSettings,
  type Tunable,
} from "@bp/shared";
import { net } from "../net/connection";
import { useApp } from "../store";
import { PowerupIcon } from "./Icon";
import { MapThumb } from "./MapPreview";
import { playableSavedMaps } from "../editor/storage";

type Tab = "general" | "hunter" | "survivor" | "map";

function Toggle({ on, disabled, onChange, label }: { on: boolean; disabled?: boolean; onChange(v: boolean): void; label: string }) {
  return <button className={`toggle ${on ? "on" : ""}`} disabled={disabled} onClick={() => onChange(!on)} aria-pressed={on} aria-label={label} />;
}

function NumberRow({ label, value, min, max, step, unit, disabled, onChange, hint }: {
  label: string; value: number; min: number; max: number; step: number; unit?: string; disabled?: boolean; hint?: string; onChange(v: number): void;
}) {
  const fmt = (v: number) => (unit === "s" && v >= 60 ? `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, "0")}` : `${+v.toFixed(2)}${unit && unit !== "s" ? unit : unit === "s" ? "s" : ""}`);
  return (
    <div className="slider-row" title={hint}>
      <span>
        {label}
        {hint && <div className="muted" style={{ fontSize: 11 }}>{hint}</div>}
      </span>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="val">{value === 0 && label.startsWith("Terminals") ? "Auto" : fmt(value)}</span>
    </div>
  );
}

function BoolRow({ label, value, disabled, onChange, hint }: { label: string; value: boolean; disabled?: boolean; hint?: string; onChange(v: boolean): void }) {
  return (
    <div className="row" style={{ padding: "6px 0" }}>
      <span className="grow">
        {label}
        {hint && <div className="muted" style={{ fontSize: 11 }}>{hint}</div>}
      </span>
      <Toggle on={value} disabled={disabled} onChange={onChange} label={label} />
    </div>
  );
}

function PowerupCard({ def, s, host, send }: { def: PowerupDef; s: RoomSettings; host: boolean; send(p: Partial<RoomSettings>): void }) {
  const tune = s.powerups[def.id];
  const [open, setOpen] = useState(false);
  const setTune = (k: "cooldown" | "duration" | "magnitude", v: number) => send({ powerups: { ...s.powerups, [def.id]: { ...tune, [k]: v } } });
  const tunables = (["cooldown", "duration", "magnitude"] as const).filter((k) => def[k]) as ("cooldown" | "duration" | "magnitude")[];
  return (
    <div className="pu-card">
      <div className="pu-head">
        <div className="pu-icon" style={{ background: `${def.color}22`, border: `1px solid ${def.color}55` }}>
          <PowerupIcon id={def.id} />
        </div>
        <div className="grow">
          <div style={{ fontWeight: 600 }}>{def.name}</div>
          <div className="muted" style={{ fontSize: 12 }}>{def.description}</div>
        </div>
        {tunables.length > 0 && (
          <button className="btn small ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? "Hide" : "Tune"}
          </button>
        )}
        <Toggle on={tune.enabled} disabled={!host} label={`Enable ${def.name}`} onChange={(v) => send({ powerups: { ...s.powerups, [def.id]: { ...tune, enabled: v } } })} />
      </div>
      {open &&
        tunables.map((k) => {
          const t = def[k] as Tunable;
          return <NumberRow key={k} label={t.label} value={tune[k] ?? t.default} min={t.min} max={t.max} step={t.step} unit={t.unit} disabled={!host} onChange={(v) => setTune(k, v)} />;
        })}
    </div>
  );
}

export function SettingsPanel({ host }: { host: boolean }) {
  const s = useApp((st) => st.settings);
  const playerCount = useApp((st) => (st.snap ? Object.keys(st.snap.players).length : 1));
  const mapId = useApp((st) => st.snap?.mapId);
  const [tab, setTab] = useState<Tab>("general");
  const pending = useRef<Partial<RoomSettings>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const send = (patch: Partial<RoomSettings>) => {
    if (!host) return;
    // Optimistic local update, then a throttled send; the server re-validates.
    useApp.setState((st) => ({ settings: { ...st.settings, ...patch } }));
    pending.current = { ...pending.current, ...patch };
    if (!timer.current)
      timer.current = setTimeout(() => {
        net.send("settings", pending.current);
        pending.current = {};
        timer.current = null;
      }, 120);
  };

  const field = (key: keyof RoomSettings) => {
    const f = NUMBER_FIELDS.find((x) => x.key === key)!;
    return <NumberRow key={key} label={f.label} hint={f.hint} value={s[key] as number} min={f.min} max={f.max} step={f.step} unit={f.unit} disabled={!host} onChange={(v) => send({ [key]: v })} />;
  };
  const autoTier = tierForPlayers(playerCount);
  const tier = s.mapTier >= 0 ? s.mapTier : autoTier;
  const hunters = effectiveHunterCount(s, playerCount);

  const importMap = async (text: string) => {
    let data: unknown;
    try {
      data = text.trim().startsWith("BPM1.") ? await decodeMapCode(text) : JSON.parse(text);
    } catch {
      return useApp.getState().toast("That isn't a valid map file or code.", "bad");
    }
    const v = validateMap(data);
    if (!v.ok || !v.map) return useApp.getState().toast(`Map rejected: ${v.errors[0]}`, "bad");
    net.send("customMap", JSON.stringify(v.map));
  };

  return (
    <div className="panel section" style={{ flex: 1 }}>
      <div className="row">
        <h3 className="grow">Room settings</h3>
        {!host && <span className="chip">Host only</span>}
      </div>
      <div className="tabs" role="tablist">
        {(["general", "hunter", "survivor", "map"] as Tab[]).map((t) => (
          <button key={t} role="tab" className={`tab ${tab === t ? "on" : ""}`} onClick={() => setTab(t)}>
            {t === "general" ? "General" : t === "hunter" ? "Hunter" : t === "survivor" ? "Survivors" : "Map"}
          </button>
        ))}
      </div>
      <div className="settings-body">
        {tab === "general" && (
          <>
            {field("maxPlayers")}
            {field("roundSeconds")}
            {field("intermissionSeconds")}
            {field("headStartSeconds")}
            <BoolRow label="Jumping" value={s.jumpEnabled} disabled={!host} onChange={(v) => send({ jumpEnabled: v })} />
            <BoolRow label="Hacking skill checks" hint="Timing checks while hacking; a miss alerts the Hunter" value={s.skillChecks} disabled={!host} onChange={(v) => send({ skillChecks: v })} />
            {host && (
              <button className="btn small ghost" style={{ marginTop: 8 }} onClick={() => net.send("settings", { ...DEFAULT_SETTINGS, maxPlayers: s.maxPlayers })}>
                Reset to defaults
              </button>
            )}
          </>
        )}
        {tab === "hunter" && (
          <>
            {field("hunterCount")}
            <p className="muted" style={{ fontSize: 12, margin: "0 0 8px" }}>
              With {playerCount} player{playerCount === 1 ? "" : "s"} now: {hunters} Hunter{hunters === 1 ? "" : "s"}, {Math.max(0, playerCount - hunters)} Survivor
              {playerCount - hunters === 1 ? "" : "s"}.
            </p>
            {field("hunterSpeed")}
            {field("swingCooldown")}
            <BoolRow label="Hunter abilities" value={s.hunterAbilitiesEnabled} disabled={!host} onChange={(v) => send({ hunterAbilitiesEnabled: v })} />
            <div className="row" style={{ padding: "6px 0" }}>
              <span className="grow">Ability selection</span>
              <div className="tabs" style={{ flex: "none" }}>
                {(["choose", "random"] as const).map((m) => (
                  <button key={m} className={`tab ${s.hunterAbilityMode === m ? "on" : ""}`} disabled={!host} onClick={() => send({ hunterAbilityMode: m })}>
                    {m === "choose" ? "Players choose" : "Random"}
                  </button>
                ))}
              </div>
            </div>
            <div className="label" style={{ margin: "10px 0 6px" }}>Hunter abilities</div>
            {HUNTER_POWERUPS.map((d) => (
              <PowerupCard key={d.id} def={d} s={s} host={host} send={send} />
            ))}
          </>
        )}
        {tab === "survivor" && (
          <>
            {field("survivorSpeed")}
            {field("hackSpeed")}
            {field("captureSeconds")}
            {field("rescueSeconds")}
            {field("downedRecoverSeconds")}
            <BoolRow label="Struggle free while carried" hint="Mash Space to escape the Hunter's grip" value={s.struggleEnabled} disabled={!host} onChange={(v) => send({ struggleEnabled: v })} />
            <BoolRow label="Survivor powerups" value={s.survivorPowerupsEnabled} disabled={!host} onChange={(v) => send({ survivorPowerupsEnabled: v })} />
            {field("pickupIntervalSeconds")}
            {field("maxPickupSlots")}
            <div className="label" style={{ margin: "10px 0 6px" }}>Survivor powerups</div>
            {SURVIVOR_POWERUPS.map((d) => (
              <PowerupCard key={d.id} def={d} s={s} host={host} send={send} />
            ))}
          </>
        )}
        {tab === "map" && (
          <>
            <div className="map-cards">
              {BUILTIN_MAPS.map((m) => (
                <button key={m.id} className={`map-card ${mapId === m.id ? "on" : ""}`} disabled={!host} onClick={() => send({ mapId: m.id })}>
                  <MapThumb def={m} tier={tier} />
                  <div style={{ fontWeight: 600, marginTop: 6, fontSize: 13 }}>{m.name}</div>
                  <div className="muted" style={{ fontSize: 11 }}>{m.floors.length} floor{m.floors.length > 1 ? "s" : ""}</div>
                </button>
              ))}
              {net.customMap && (
                <button className={`map-card ${mapId === "custom" ? "on" : ""}`} disabled={!host} onClick={() => send({ mapId: "custom" })}>
                  <MapThumb def={net.customMap} tier={tier} />
                  <div style={{ fontWeight: 600, marginTop: 6, fontSize: 13 }}>{net.customMap.name}</div>
                  <div className="muted" style={{ fontSize: 11 }}>Custom map</div>
                </button>
              )}
            </div>
            <div className="row" style={{ padding: "10px 0 4px" }}>
              <span className="grow">Map size</span>
            </div>
            <div className="tabs">
              <button className={`tab ${s.mapTier === -1 ? "on" : ""}`} disabled={!host} onClick={() => send({ mapTier: -1 })}>
                Auto ({TIER_LABELS[autoTier].split(" ")[0]})
              </button>
              {TIER_LABELS.map((l, i) => (
                <button key={l} className={`tab ${s.mapTier === i ? "on" : ""}`} disabled={!host} onClick={() => send({ mapTier: i })}>
                  {l.split(" ")[0]}
                </button>
              ))}
            </div>
            <p className="muted" style={{ fontSize: 12 }}>
              Larger sizes unlock sealed wings with more terminals, pods and exits. Auto picks a size from the number of players.
            </p>
            {field("terminalsRequired")}
            {field("exitOpenSeconds")}
            {host && (
              <div className="col" style={{ marginTop: 10 }}>
                <div className="label">Custom map</div>
                {playableSavedMaps().length > 0 && (
                  <div className="col" style={{ gap: 4 }}>
                    {playableSavedMaps().map((sm) => (
                      <div key={sm.key} className="player-row" style={{ padding: "6px 10px" }}>
                        <span className="grow">{sm.map.name}</span>
                        <button className="btn small" onClick={() => net.send("customMap", JSON.stringify(sm.map))}>
                          Use
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="row wrap">
                  <button className="btn small" onClick={() => useApp.setState({ screen: "editor" })}>
                    Open map editor
                  </button>
                  <label className="btn small">
                    Import map file
                    <input
                      type="file"
                      accept=".json,.bpmap,application/json"
                      hidden
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (f && f.size < 400_000) await importMap(await f.text());
                        else if (f) useApp.getState().toast("Map file is too large.", "bad");
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <button
                    className="btn small"
                    onClick={async () => {
                      const code = prompt("Paste a map share code (starts with BPM1.)");
                      if (code) await importMap(code);
                    }}
                  >
                    Paste map code
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
