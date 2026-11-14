import { z } from "zod";

/** Block-avatar configuration. Synced to the room as compact JSON, validated on the server. */
export const AVATAR_PARTS = {
  head: ["block", "round", "tall", "wide", "bevel"],
  face: ["smile", "grin", "determined", "sleepy", "surprised", "cool", "wink", "neutral", "fierce", "happy"],
  hair: ["none", "buzz", "spiky", "bob", "long", "ponytail", "mohawk", "afro", "swoop", "buns"],
  torso: ["classic", "slim", "broad"],
  shirt: ["none", "tee", "hoodie", "jacket", "labcoat", "vest", "tank", "stripes", "overalls"],
  pants: ["none", "jeans", "shorts", "cargo", "skirt", "joggers"],
  shoes: ["sneakers", "boots", "none"],
  accessory: ["none", "glasses", "shades", "headphones", "beanie", "cap", "backpack", "scarf", "crown", "visor", "mask", "horns"],
} as const;

export type PartKey = keyof typeof AVATAR_PARTS;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const pick = <K extends PartKey>(k: K) => z.enum(AVATAR_PARTS[k] as unknown as [string, ...string[]]);
const ratio = (min: number, max: number) => z.number().finite().min(min).max(max);

export const AvatarSchema = z
  .object({
    v: z.literal(1),
    head: pick("head"),
    face: pick("face"),
    hair: pick("hair"),
    torso: pick("torso"),
    shirt: pick("shirt"),
    pants: pick("pants"),
    shoes: pick("shoes"),
    accessory: pick("accessory"),
    colors: z
      .object({
        head: hex,
        torso: hex,
        arms: hex,
        legs: hex,
        hair: hex,
        shirt: hex,
        shirtAccent: hex,
        pants: hex,
        shoes: hex,
        accessory: hex,
        eyes: hex,
      })
      .strict(),
    scale: z
      .object({
        height: ratio(0.9, 1.12),
        width: ratio(0.85, 1.15),
        head: ratio(0.9, 1.15),
        arms: ratio(0.9, 1.1),
        legs: ratio(0.88, 1.1),
      })
      .strict(),
  })
  .strict();

export type Avatar = z.infer<typeof AvatarSchema>;

export const DEFAULT_AVATAR: Avatar = {
  v: 1,
  head: "block",
  face: "smile",
  hair: "spiky",
  torso: "classic",
  shirt: "hoodie",
  pants: "jeans",
  shoes: "sneakers",
  accessory: "none",
  colors: {
    head: "#f2c79b",
    torso: "#f2c79b",
    arms: "#f2c79b",
    legs: "#f2c79b",
    hair: "#3b2a20",
    shirt: "#2f7de1",
    shirtAccent: "#f4f4f4",
    pants: "#2b3550",
    shoes: "#1d1d1f",
    accessory: "#222222",
    eyes: "#1a1a1a",
  },
  scale: { height: 1, width: 1, head: 1, arms: 1, legs: 1 },
};

export const SKIN_TONES = ["#ffe0bd", "#f2c79b", "#e0ac69", "#c68642", "#8d5524", "#5c3a1e", "#3d2616", "#ffd34d", "#9ad3ff", "#b6f2a4"];
export const PALETTE = [
  "#1d1d1f", "#f4f4f4", "#9aa3ad", "#e63946", "#ff8c42", "#ffd166", "#06d6a0", "#2a9d8f",
  "#2f7de1", "#3a0ca3", "#7b2cbf", "#f72585", "#8d5524", "#3b2a20", "#c9b79c", "#0b3d2e",
];

export function parseAvatar(input: unknown): Avatar | null {
  try {
    const obj = typeof input === "string" ? (input.length > 2000 ? null : JSON.parse(input)) : input;
    const r = AvatarSchema.safeParse(obj);
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

export function randomAvatar(): Avatar {
  const r = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)];
  const skin = r(SKIN_TONES.slice(0, 7));
  return {
    ...DEFAULT_AVATAR,
    head: r(AVATAR_PARTS.head),
    face: r(AVATAR_PARTS.face),
    hair: r(AVATAR_PARTS.hair),
    shirt: r(AVATAR_PARTS.shirt.slice(1)),
    pants: r(AVATAR_PARTS.pants.slice(1)),
    accessory: Math.random() < 0.5 ? "none" : r(AVATAR_PARTS.accessory),
    colors: {
      ...DEFAULT_AVATAR.colors,
      head: skin,
      torso: skin,
      arms: skin,
      legs: skin,
      hair: r(["#3b2a20", "#1d1d1f", "#c9b79c", "#8d5524", "#e63946", "#f4f4f4", "#7b2cbf"]),
      shirt: r(PALETTE),
      shirtAccent: r(PALETTE),
      pants: r(PALETTE),
      shoes: r(PALETTE),
      accessory: r(PALETTE),
    },
  };
}
