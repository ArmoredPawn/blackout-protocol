/** World units are metres. */
export const CELL = 2; // size of one map tile
export const FLOOR_H = 4; // height of one storey
export const WALL_H = 3.6; // visual wall height (slightly below storey so ceilings read)

export const PLAYER_RADIUS = 0.38;
export const PLAYER_HEIGHT = 1.8;
export const CRAWL_HEIGHT = 0.8;
export const VENT_CLEARANCE = 1.0; // vents allow only crawling players

export const GRAVITY = 24;
export const JUMP_VELOCITY = 7.6;
export const STEP_HEIGHT = 0.6;

export const BASE_SURVIVOR_SPEED = 5.4;
export const BASE_HUNTER_SPEED = 5.8;
export const CRAWL_SPEED_FACTOR = 0.42;
export const DOWNED_SPEED_FACTOR = 0.22;

export const MAX_PLAYERS = 20;
export const MIN_PLAYERS_TO_START = 2;
export const MAX_NAME_LEN = 18;

export const NET_SEND_HZ = 20;
export const SERVER_TICK_MS = 50;
export const PATCH_RATE_MS = 50;
export const INTERP_DELAY_MS = 110;

/** Interaction ranges (metres). */
export const RANGE = {
  terminal: 2.3,
  pod: 2.4,
  exit: 2.6,
  pickup: 1.6,
  downed: 2.4,
  swing: 2.7,
  rescue: 2.4,
} as const;

export const ROOM_NAME = "private_room";

/** Anim/state flags packed into a single byte in movement updates. */
export const AF = {
  grounded: 1,
  crawling: 2,
  moving: 4,
  running: 8,
} as const;

export type Role = "none" | "survivor" | "hunter";
export type PlayerStatus =
  | "lobby"
  | "free"
  | "downed"
  | "carried"
  | "podded"
  | "eliminated"
  | "escaped"
  | "spectating";

export type Phase = "lobby" | "intermission" | "headstart" | "playing" | "results";

/** Custom app close codes (4011–4999 are free for app use in Colyseus). */
export const CLOSE = {
  kicked: 4011,
  roomFull: 4012,
  badRequest: 4013,
  rateLimited: 4014,
} as const;
