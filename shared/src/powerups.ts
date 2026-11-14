/**
 * Modular powerup registry.
 *
 * To add a powerup:
 *   1. Add an entry to POWERUPS below (id, team, tunables, icon, colour).
 *   2. Implement its server effect in server/src/powerups/handlers.ts (keyed by id).
 *   3. (Optional) add a visual effect in client/src/game/fx/PowerupFx.tsx.
 * Settings, validation, lobby UI and HUD all pick it up automatically.
 */

export type Team = "hunter" | "survivor";

export interface Tunable {
  default: number;
  min: number;
  max: number;
  step: number;
  label: string;
  unit: string;
}

export interface PowerupDef {
  id: string;
  team: Team;
  name: string;
  description: string;
  /** SVG path data on a 24×24 viewBox. */
  icon: string;
  color: string;
  defaultEnabled: boolean;
  /** Hunter abilities are cooldown-based (Q). Survivor powerups are single-use pickups. */
  cooldown?: Tunable;
  duration?: Tunable;
  magnitude?: Tunable;
}

const t = (d: number, min: number, max: number, step: number, label: string, unit: string): Tunable => ({
  default: d,
  min,
  max,
  step,
  label,
  unit,
});

const ICON = {
  bolt: "M13 2 4 14h7l-1 8 9-12h-7z",
  radar: "M12 2a10 10 0 1 0 10 10h-2a8 8 0 1 1-8-8zm0 4a6 6 0 1 0 6 6h-2a4 4 0 1 1-4-4zm0 4a2 2 0 1 0 2 2h-2z",
  eye: "M12 5C6 5 2 12 2 12s4 7 10 7 10-7 10-7-4-7-10-7zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8z",
  lock: "M7 10V7a5 5 0 0 1 10 0v3h1v12H6V10zm2 0h6V7a3 3 0 0 0-6 0z",
  dash: "M2 11h9V7l7 5-7 5v-4H2zm16-6h3v14h-3z",
  trap: "M12 3 3 21h18zm0 5 5 10H7z",
  wave: "M2 12c3-6 5-6 8 0s5 6 8 0 3-4 4-4v3c-1 0-2 4-4 4-3 0-4-6-6-6s-3 6-6 6-4-4-4-4z",
  link: "M8 12a4 4 0 0 1 4-4h3V6h-3a6 6 0 0 0 0 12h3v-2h-3a4 4 0 0 1-4-4zm4 1h0zm-3-2h6v2H9zm6-5v2h0a4 4 0 0 1 0 8v2a6 6 0 0 0 0-12z",
  shield: "M12 2 4 5v6c0 5 3.5 9.7 8 11 4.5-1.3 8-6 8-11V5z",
  cloud: "M6 19a5 5 0 0 1-.5-10A7 7 0 0 1 19 9a5 5 0 0 1-1 10z",
  ghost: "M12 2a8 8 0 0 0-8 8v12l3-2 2.5 2 2.5-2 2.5 2 2.5-2 3 2V10a8 8 0 0 0-8-8zM9 9a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z",
  chip: "M8 2v2H6a2 2 0 0 0-2 2v2H2v2h2v4H2v2h2v2a2 2 0 0 0 2 2h2v2h2v-2h4v2h2v-2h2a2 2 0 0 0 2-2v-2h2v-2h-2v-4h2V8h-2V6a2 2 0 0 0-2-2h-2V2h-2v2h-4V2zm0 6h8v8H8z",
  feather: "M20 4C11 4 6 9 5 17l-2 4 2-1c2-1 3-3 3-3h5l-2-2h4l-2-2h4c2-3 3-6 3-9z",
};

export const POWERUPS: PowerupDef[] = [
  // ───── Hunter abilities ─────
  {
    id: "adrenaline",
    team: "hunter",
    name: "Adrenaline",
    description: "Surge of speed for a short burst.",
    icon: ICON.bolt,
    color: "#ff5b4a",
    defaultEnabled: true,
    cooldown: t(32, 8, 120, 1, "Cooldown", "s"),
    duration: t(5, 1, 15, 0.5, "Duration", "s"),
    magnitude: t(1.45, 1.1, 2, 0.05, "Speed multiplier", "×"),
  },
  {
    id: "sonar",
    team: "hunter",
    name: "Sonar Pulse",
    description: "Emit a pulse that reveals every Survivor within range through walls.",
    icon: ICON.radar,
    color: "#ff9a3c",
    defaultEnabled: true,
    cooldown: t(45, 10, 180, 1, "Cooldown", "s"),
    duration: t(4, 1, 12, 0.5, "Reveal time", "s"),
    magnitude: t(28, 8, 80, 1, "Radius", "m"),
  },
  {
    id: "tracker",
    team: "hunter",
    name: "Bloodhound",
    description: "Lock on to the nearest Survivor and see them through walls.",
    icon: ICON.eye,
    color: "#e0406a",
    defaultEnabled: true,
    cooldown: t(50, 10, 180, 1, "Cooldown", "s"),
    duration: t(6, 1, 20, 0.5, "Duration", "s"),
  },
  {
    id: "lockdown",
    team: "hunter",
    name: "Lockdown",
    description: "Jam every terminal within range. Jammed terminals can't be hacked.",
    icon: ICON.lock,
    color: "#c45cff",
    defaultEnabled: true,
    cooldown: t(55, 15, 180, 1, "Cooldown", "s"),
    duration: t(9, 2, 30, 0.5, "Jam time", "s"),
    magnitude: t(18, 6, 60, 1, "Radius", "m"),
  },
  {
    id: "lunge",
    team: "hunter",
    name: "Lunge",
    description: "Dash forward a short distance. Great for closing gaps.",
    icon: ICON.dash,
    color: "#ff7043",
    defaultEnabled: true,
    cooldown: t(18, 4, 90, 1, "Cooldown", "s"),
    duration: t(0.4, 0.2, 1, 0.05, "Dash time", "s"),
    magnitude: t(3.2, 1.5, 5, 0.1, "Dash speed", "×"),
  },
  {
    id: "snare",
    team: "hunter",
    name: "Snare Trap",
    description: "Drop a hidden trap. Survivors who step in are rooted and revealed.",
    icon: ICON.trap,
    color: "#d4a017",
    defaultEnabled: true,
    cooldown: t(25, 5, 120, 1, "Cooldown", "s"),
    duration: t(3, 1, 8, 0.5, "Root time", "s"),
    magnitude: t(2, 1, 5, 1, "Max traps", ""),
  },
  // ───── Survivor powerups (single-use pickups) ─────
  {
    id: "sprint",
    team: "survivor",
    name: "Sprint Shot",
    description: "A quick boost of speed.",
    icon: ICON.bolt,
    color: "#4ad6ff",
    defaultEnabled: true,
    duration: t(6, 1, 15, 0.5, "Duration", "s"),
    magnitude: t(1.4, 1.1, 2, 0.05, "Speed multiplier", "×"),
  },
  {
    id: "terminalPing",
    team: "survivor",
    name: "Network Scan",
    description: "Reveal every unhacked terminal and its progress for your whole team.",
    icon: ICON.wave,
    color: "#5cffb0",
    defaultEnabled: true,
    duration: t(12, 3, 40, 1, "Duration", "s"),
  },
  {
    id: "teamLink",
    team: "survivor",
    name: "Team Link",
    description: "Every Survivor sees all teammates and their status through walls.",
    icon: ICON.link,
    color: "#7aa8ff",
    defaultEnabled: true,
    duration: t(14, 3, 40, 1, "Duration", "s"),
  },
  {
    id: "shield",
    team: "survivor",
    name: "Kinetic Shield",
    description: "Blocks the next Hunter hit. Used while downed, it gets you back on your feet.",
    icon: ICON.shield,
    color: "#ffd84a",
    defaultEnabled: true,
    duration: t(10, 2, 30, 1, "Duration", "s"),
  },
  {
    id: "smoke",
    team: "survivor",
    name: "Smoke Bomb",
    description: "Burst of thick smoke that blinds Hunters and hides Survivors from reveals.",
    icon: ICON.cloud,
    color: "#b0b8c8",
    defaultEnabled: true,
    duration: t(8, 2, 20, 0.5, "Duration", "s"),
    magnitude: t(5, 2, 10, 0.5, "Radius", "m"),
  },
  {
    id: "decoy",
    team: "survivor",
    name: "Holo Decoy",
    description: "Project a running hologram of yourself to mislead Hunters.",
    icon: ICON.ghost,
    color: "#e07aff",
    defaultEnabled: true,
    duration: t(6, 2, 15, 0.5, "Duration", "s"),
  },
  {
    id: "overclock",
    team: "survivor",
    name: "Overclock",
    description: "Hack terminals much faster for a while.",
    icon: ICON.chip,
    color: "#3cffd2",
    defaultEnabled: true,
    duration: t(12, 3, 40, 1, "Duration", "s"),
    magnitude: t(1.8, 1.1, 3, 0.1, "Hack multiplier", "×"),
  },
  {
    id: "ghostStep",
    team: "survivor",
    name: "Ghost Step",
    description: "Silent footsteps and immunity to Hunter reveals.",
    icon: ICON.feather,
    color: "#9be8ff",
    defaultEnabled: true,
    duration: t(10, 2, 30, 1, "Duration", "s"),
  },
];

export const POWERUP_MAP: Record<string, PowerupDef> = Object.fromEntries(POWERUPS.map((p) => [p.id, p]));
export const HUNTER_POWERUPS = POWERUPS.filter((p) => p.team === "hunter");
export const SURVIVOR_POWERUPS = POWERUPS.filter((p) => p.team === "survivor");

export interface PowerupTuning {
  enabled: boolean;
  cooldown?: number;
  duration?: number;
  magnitude?: number;
}

export function defaultPowerupTuning(): Record<string, PowerupTuning> {
  const out: Record<string, PowerupTuning> = {};
  for (const p of POWERUPS) {
    out[p.id] = {
      enabled: p.defaultEnabled,
      cooldown: p.cooldown?.default,
      duration: p.duration?.default,
      magnitude: p.magnitude?.default,
    };
  }
  return out;
}

const clampTo = (v: unknown, tn: Tunable | undefined): number | undefined => {
  if (!tn) return undefined;
  const n = typeof v === "number" && Number.isFinite(v) ? v : tn.default;
  return Math.min(tn.max, Math.max(tn.min, n));
};

/** Server-side sanitiser: unknown ids dropped, every number clamped to its range. */
export function sanitizePowerupTuning(input: unknown): Record<string, PowerupTuning> {
  const src = (input && typeof input === "object" ? input : {}) as Record<string, any>;
  const out: Record<string, PowerupTuning> = {};
  for (const p of POWERUPS) {
    const s = src[p.id] && typeof src[p.id] === "object" ? src[p.id] : {};
    out[p.id] = {
      enabled: typeof s.enabled === "boolean" ? s.enabled : p.defaultEnabled,
      cooldown: clampTo(s.cooldown, p.cooldown),
      duration: clampTo(s.duration, p.duration),
      magnitude: clampTo(s.magnitude, p.magnitude),
    };
  }
  return out;
}
