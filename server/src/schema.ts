import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";

/**
 * Synchronised state. Only gameplay-relevant data lives here; animation,
 * sound and effects are derived on clients. Times are room-clock ms (`now`).
 */
export class PlayerState extends Schema {
  @type("string") id = "";
  @type("string") name = "";
  @type("string") avatar = "";
  @type("boolean") ready = false;
  @type("boolean") connected = true;
  @type("uint16") joinOrder = 0;
  @type("string") role = "none"; // none | survivor | hunter
  @type("string") status = "lobby"; // PlayerStatus
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("float32") z = 0;
  @type("float32") ry = 0;
  @type("uint8") anim = 0; // AF flags
  @type("uint16") corr = 0; // bumps when the server corrects this player's position
  @type("string") carrying = "";
  @type("string") carriedBy = "";
  @type("string") pod = ""; // pod id when podded
  @type("float64") podEndsAt = 0;
  @type("float64") downedEndsAt = 0;
  @type("float32") struggle = 0; // 0..1
  @type("string") hacking = ""; // terminal id
  @type("string") ability = ""; // hunter ability id
  @type("float64") abilityReadyAt = 0;
  @type("float64") swingReadyAt = 0;
  @type(["string"]) slots = new ArraySchema<string>();
  @type("string") effects = ""; // comma-separated active effect ids
  @type("float64") stunUntil = 0;
  @type("uint16") statHacks = 0; // % of terminals contributed ×100 / 100
  @type("uint8") statRescues = 0;
  @type("uint8") statCaptures = 0;
  @type("uint8") statHits = 0;
  @type("uint16") wins = 0;
}

export class TerminalState extends Schema {
  @type("float32") progress = 0; // 0..1
  @type("boolean") hacked = false;
  @type("uint8") hackers = 0;
  @type("float64") jammedUntil = 0;
  @type("float64") alarmAt = 0;
}

export class PodState extends Schema {
  @type("string") occupant = "";
  @type("float32") rescue = 0; // 0..1
}

export class ExitState extends Schema {
  @type("float32") progress = 0;
  @type("boolean") open = false;
}

export class PickupState extends Schema {
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("float32") z = 0;
}

export class TrapState extends Schema {
  @type("string") owner = "";
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("float32") z = 0;
  @type("boolean") sprung = false;
}

export class ZoneState extends Schema {
  @type("string") kind = ""; // smoke | decoy
  @type("string") owner = "";
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("float32") z = 0;
  @type("float32") ry = 0;
  @type("float32") radius = 0;
  @type("float64") endsAt = 0;
}

export class RoomState extends Schema {
  @type("float64") now = 0;
  @type("string") code = "";
  @type("string") hostId = "";
  @type("string") phase = "lobby";
  @type("float64") phaseEndsAt = 0;
  @type("uint16") round = 0;
  @type("string") settings = "{}"; // JSON of RoomSettings (validated)
  @type("string") mapId = "kestrel";
  @type("string") mapName = "";
  @type("uint32") mapRev = 0; // bumps when a custom map is uploaded
  @type("uint8") mapTier = 0;
  @type("uint8") terminalsRequired = 0;
  @type("uint8") terminalsHacked = 0;
  @type("boolean") exitsPowered = false;
  @type("string") winner = ""; // survivors | hunters
  @type("string") resultText = "";
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type({ map: TerminalState }) terminals = new MapSchema<TerminalState>();
  @type({ map: PodState }) pods = new MapSchema<PodState>();
  @type({ map: ExitState }) exits = new MapSchema<ExitState>();
  @type({ map: PickupState }) pickups = new MapSchema<PickupState>();
  @type({ map: TrapState }) traps = new MapSchema<TrapState>();
  @type({ map: ZoneState }) zones = new MapSchema<ZoneState>();
}
