import { useState } from "react";
import { AVATAR_PARTS, DEFAULT_AVATAR, PALETTE, SKIN_TONES, randomAvatar, type Avatar, type PartKey } from "@bp/shared";
import { useApp } from "../store";
import type { PoseMode } from "../game/Avatar3D";
import { AvatarPreview } from "./AvatarPreview";

type ColorKey = keyof Avatar["colors"];

const PART_LABELS: Record<PartKey, string> = {
  head: "Head shape",
  face: "Face",
  hair: "Hair",
  torso: "Body type",
  shirt: "Top",
  pants: "Bottoms",
  shoes: "Shoes",
  accessory: "Accessory",
};

const BODY_PALETTE = [...SKIN_TONES.slice(0, 4), ...PALETTE.slice(0, 8)];

const COLOR_GROUPS: { label: string; keys: ColorKey[]; palette: string[] }[] = [
  { label: "Skin (all parts)", keys: ["head", "torso", "arms", "legs"], palette: SKIN_TONES },
  { label: "Head", keys: ["head"], palette: SKIN_TONES },
  { label: "Torso", keys: ["torso"], palette: BODY_PALETTE },
  { label: "Arms", keys: ["arms"], palette: BODY_PALETTE },
  { label: "Legs", keys: ["legs"], palette: BODY_PALETTE },
  { label: "Hair", keys: ["hair"], palette: PALETTE },
  { label: "Top", keys: ["shirt"], palette: PALETTE },
  { label: "Top accent", keys: ["shirtAccent"], palette: PALETTE },
  { label: "Bottoms", keys: ["pants"], palette: PALETTE },
  { label: "Shoes", keys: ["shoes"], palette: PALETTE },
  { label: "Accessory", keys: ["accessory"], palette: PALETTE },
  { label: "Eyes", keys: ["eyes"], palette: ["#1a1a1a", "#3b2a20", "#2f7de1", "#06d6a0", "#7b2cbf", "#e63946", "#f4f4f4"] },
];

const SCALES: { key: keyof Avatar["scale"]; label: string; min: number; max: number }[] = [
  { key: "height", label: "Height", min: 0.9, max: 1.12 },
  { key: "width", label: "Width", min: 0.85, max: 1.15 },
  { key: "head", label: "Head size", min: 0.9, max: 1.15 },
  { key: "arms", label: "Arm length", min: 0.9, max: 1.1 },
  { key: "legs", label: "Leg length", min: 0.88, max: 1.1 },
];

const POSES: PoseMode[] = ["idle", "walk", "run", "jump", "crawl", "hack", "downed"];

export function AvatarEditor() {
  const saved = useApp((s) => s.prefs.avatar);
  const updatePrefs = useApp((s) => s.updatePrefs);
  const [a, setA] = useState<Avatar>(saved);
  const [tab, setTab] = useState<"parts" | "colors" | "body">("parts");
  const [mode, setMode] = useState<PoseMode>("idle");
  const [hunter, setHunter] = useState(false);
  const set = (patch: Partial<Avatar>) => setA((cur) => ({ ...cur, ...patch }));
  const setColor = (keys: ColorKey[], c: string) =>
    setA((cur) => ({ ...cur, colors: { ...cur.colors, ...Object.fromEntries(keys.map((k) => [k, c])) } }));

  const save = () => {
    updatePrefs({ avatar: a });
    useApp.getState().toast("Avatar saved in this browser", "good");
    useApp.setState({ screen: "home" });
  };

  return (
    <div className="screen">
      <div className="editor">
        <div className="col" style={{ minHeight: 0 }}>
          <div className="avatar-stage" style={{ flex: 1 }}>
            <AvatarPreview avatar={a} mode={mode} hunter={hunter} />
          </div>
          <div className="tabs">
            {POSES.map((m) => (
              <button key={m} className={`tab ${mode === m ? "on" : ""}`} onClick={() => setMode(m)}>
                {m}
              </button>
            ))}
            <button className={`tab ${hunter ? "on" : ""}`} onClick={() => setHunter((h) => !h)} title="Preview how you look as the Hunter">
              Hunter
            </button>
          </div>
        </div>
        <div className="panel editor-side">
          <div style={{ padding: "16px 16px 0" }} className="col">
            <div className="row">
              <h2 className="grow">Avatar</h2>
              <button className="btn small" onClick={() => setA(randomAvatar())}>
                Randomize
              </button>
              <button className="btn small ghost" onClick={() => setA(DEFAULT_AVATAR)}>
                Reset
              </button>
            </div>
            <div className="tabs">
              <button className={`tab ${tab === "parts" ? "on" : ""}`} onClick={() => setTab("parts")}>
                Parts
              </button>
              <button className={`tab ${tab === "colors" ? "on" : ""}`} onClick={() => setTab("colors")}>
                Colours
              </button>
              <button className={`tab ${tab === "body" ? "on" : ""}`} onClick={() => setTab("body")}>
                Proportions
              </button>
            </div>
          </div>
          <div className="editor-scroll col" style={{ gap: 16 }}>
            {tab === "parts" &&
              (Object.keys(AVATAR_PARTS) as PartKey[]).map((k) => (
                <div key={k} className="col" style={{ gap: 6 }}>
                  <span className="label">{PART_LABELS[k]}</span>
                  <div className="opts">
                    {AVATAR_PARTS[k].map((v) => (
                      <button key={v} className={`opt ${a[k] === v ? "on" : ""}`} onClick={() => set({ [k]: v } as Partial<Avatar>)}>
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            {tab === "colors" &&
              COLOR_GROUPS.map((g) => (
                <div key={g.label} className="col" style={{ gap: 6 }}>
                  <span className="label">{g.label}</span>
                  <div className="swatches">
                    {g.palette.map((c) => (
                      <button
                        key={c}
                        className={`swatch ${a.colors[g.keys[0]].toLowerCase() === c.toLowerCase() ? "on" : ""}`}
                        style={{ background: c }}
                        onClick={() => setColor(g.keys, c)}
                        aria-label={`${g.label} ${c}`}
                      />
                    ))}
                    <input
                      type="color"
                      className="swatch-custom"
                      value={a.colors[g.keys[0]]}
                      onChange={(e) => setColor(g.keys, e.target.value)}
                      aria-label={`Custom ${g.label} colour`}
                    />
                  </div>
                </div>
              ))}
            {tab === "body" &&
              SCALES.map((s) => (
                <div key={s.key} className="slider-row">
                  <span>{s.label}</span>
                  <input
                    type="range"
                    min={s.min}
                    max={s.max}
                    step={0.01}
                    value={a.scale[s.key]}
                    onChange={(e) => setA((cur) => ({ ...cur, scale: { ...cur.scale, [s.key]: Number(e.target.value) } }))}
                  />
                  <span className="val">{Math.round(a.scale[s.key] * 100)}%</span>
                </div>
              ))}
          </div>
          <div className="row" style={{ padding: 16, borderTop: "1px solid var(--line)" }}>
            <button className="btn ghost" onClick={() => useApp.setState({ screen: "home" })}>
              Cancel
            </button>
            <span className="grow muted" style={{ fontSize: 12 }}>
              Saved to this browser only
            </span>
            <button className="btn primary" onClick={save}>
              Save avatar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
