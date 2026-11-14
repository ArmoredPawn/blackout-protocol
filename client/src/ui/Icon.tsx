import { POWERUP_MAP } from "@bp/shared";

export function PowerupIcon({ id, size = 22 }: { id: string; size?: number }) {
  const def = POWERUP_MAP[id];
  if (!def) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d={def.icon} fill={def.color} />
    </svg>
  );
}

const PATHS: Record<string, string> = {
  copy: "M8 8V4h12v12h-4v4H4V8zm2 0h6v6h2V6h-8zM6 10v8h8v-8z",
  link: "M10.6 13.4a4 4 0 0 1 0-5.6l3-3a4 4 0 0 1 5.6 5.6l-1.5 1.5-1.4-1.4 1.5-1.5a2 2 0 0 0-2.8-2.8l-3 3a2 2 0 0 0 0 2.8zm2.8-2.8a4 4 0 0 1 0 5.6l-3 3a4 4 0 0 1-5.6-5.6l1.5-1.5 1.4 1.4-1.5 1.5a2 2 0 0 0 2.8 2.8l3-3a2 2 0 0 0 0-2.8z",
  crown: "M3 18h18v2H3zm0-2L5 6l5 5 2-6 2 6 5-5 2 10z",
  gear: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm9 4-2.1.6a7 7 0 0 1-.7 1.7l1 1.9-1.4 1.4-1.9-1a7 7 0 0 1-1.7.7L13 21h-2l-.6-2.1a7 7 0 0 1-1.7-.7l-1.9 1-1.4-1.4 1-1.9a7 7 0 0 1-.7-1.7L3 13v-2l2.1-.6a7 7 0 0 1 .7-1.7l-1-1.9 1.4-1.4 1.9 1a7 7 0 0 1 1.7-.7L11 3h2l.6 2.1a7 7 0 0 1 1.7.7l1.9-1 1.4 1.4-1 1.9a7 7 0 0 1 .7 1.7L21 11z",
  exit: "M10 3h10v18H10v-2h8V5h-8zm1 5 1.4 1.4L10.8 11H16v2h-5.2l1.6 1.6L11 16l-4-4z",
  kick: "M6 6l12 12M18 6 6 18",
  check: "M4 12l5 5L20 6",
  user: "M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-5 0-9 2.5-9 6v2h18v-2c0-3.5-4-6-9-6z",
  map: "M9 3 3 5v16l6-2 6 2 6-2V3l-6 2zm0 2.2 6 2v11.6l-6-2z",
  volume: "M4 9h4l5-5v16l-5-5H4zm12 .5a4 4 0 0 1 0 5l1.4 1.4a6 6 0 0 0 0-7.8z",
  mute: "M4 9h4l5-5v16l-5-5H4zm11.5 0 1.5-1.5 2 2 2-2 1.5 1.5-2 2 2 2-1.5 1.5-2-2-2 2-1.5-1.5 2-2z",
};

export function Icon({ name, size = 18, stroke = false }: { name: keyof typeof PATHS | string; size?: number; stroke?: boolean }) {
  const d = PATHS[name] ?? "";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {stroke ? <path d={d} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" /> : <path d={d} fill="currentColor" />}
    </svg>
  );
}
