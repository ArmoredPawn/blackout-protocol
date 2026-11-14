import type { PlayerStatus, Role, Phase } from "@bp/shared";

export interface PlayerSnap {
  id: string;
  name: string;
  avatar: string;
  ready: boolean;
  connected: boolean;
  joinOrder: number;
  role: Role;
  status: PlayerStatus;
  x: number;
  y: number;
  z: number;
  ry: number;
  anim: number;
  corr: number;
  carrying: string;
  carriedBy: string;
  pod: string;
  podEndsAt: number;
  downedEndsAt: number;
  struggle: number;
  hacking: string;
  ability: string;
  abilityReadyAt: number;
  swingReadyAt: number;
  slots: string[];
  effects: string;
  statHacks: number;
  statRescues: number;
  statCaptures: number;
  statHits: number;
  wins: number;
}

export interface TerminalSnap {
  progress: number;
  hacked: boolean;
  hackers: number;
  jammedUntil: number;
  alarmAt: number;
}

export interface PodSnap {
  occupant: string;
  rescue: number;
}

export interface ExitSnap {
  progress: number;
  open: boolean;
}

export interface PointSnap {
  x: number;
  y: number;
  z: number;
}

export interface TrapSnap extends PointSnap {
  owner: string;
  sprung: boolean;
}

export interface ZoneSnap extends PointSnap {
  kind: "smoke" | "decoy";
  owner: string;
  ry: number;
  radius: number;
  endsAt: number;
}

export interface RoomSnap {
  now: number;
  code: string;
  hostId: string;
  phase: Phase;
  phaseEndsAt: number;
  round: number;
  settings: string;
  mapId: string;
  mapName: string;
  mapRev: number;
  mapTier: number;
  terminalsRequired: number;
  terminalsHacked: number;
  exitsPowered: boolean;
  winner: string;
  resultText: string;
  players: Record<string, PlayerSnap>;
  terminals: Record<string, TerminalSnap>;
  pods: Record<string, PodSnap>;
  exits: Record<string, ExitSnap>;
  pickups: Record<string, PointSnap>;
  traps: Record<string, TrapSnap>;
  zones: Record<string, ZoneSnap>;
}
