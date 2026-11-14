import { z } from "zod";

/** Client → server message payload schemas. Every message is validated before use. */
export const C2S = {
  move: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    z: z.number().finite(),
    ry: z.number().finite(),
    a: z.number().int().min(0).max(255),
    s: z.number().int().min(0),
  }),
  ready: z.boolean(),
  settings: z.record(z.string(), z.unknown()),
  kick: z.string().max(40),
  transferHost: z.string().max(40),
  start: z.null().optional(),
  hold: z.boolean(),
  swing: z.object({ ry: z.number().finite() }),
  ability: z.object({ slot: z.number().int().min(-1).max(3) }),
  check: z.object({ id: z.number().int(), hit: z.boolean() }),
  struggle: z.null().optional(),
  profile: z.object({ name: z.string().max(40), avatar: z.string().max(2000) }),
  chooseAbility: z.string().max(32),
  chat: z.string().min(1).max(160),
  customMap: z.string().max(400_000),
  returnToLobby: z.null().optional(),
} as const;

export type C2SType = keyof typeof C2S;

/** Server → client one-off events (state changes are synced through schema). */
export interface FxEvent {
  kind:
    | "swing"
    | "hit"
    | "blocked"
    | "down"
    | "pickup"
    | "pod"
    | "rescue"
    | "eliminated"
    | "escape"
    | "hacked"
    | "alarm"
    | "exitsPowered"
    | "exitOpen"
    | "ability"
    | "struggleFree"
    | "recover"
    | "trap"
    | "powerupGet";
  id?: string; // actor session id
  target?: string;
  x?: number;
  y?: number;
  z?: number;
  ability?: string;
  ref?: string;
}

export interface SkillCheckMsg {
  id: number;
  /** ms after receipt when the success zone starts / ends, and total duration. */
  start: number;
  end: number;
  total: number;
}

export interface NoticeMsg {
  text: string;
  tone: "info" | "good" | "bad" | "warn";
}

export interface ChatMsg {
  from: string;
  name: string;
  text: string;
}
