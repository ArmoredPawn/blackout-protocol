/**
 * Prop catalog shared by server (collision) and client (rendering + editor palette).
 * Footprint w × d in metres when r = 0; h = height. solid = blocks movement.
 */
export interface PropDef {
  w: number;
  d: number;
  h: number;
  solid: boolean;
  label: string;
  category: "furniture" | "tech" | "industrial" | "decor" | "storage" | "structure";
  /** Offset of footprint centre toward the back (-z when r=0) – used for wall-hugging props. */
  back?: number;
}

export const PROPS: Record<string, PropDef> = {
  desk: { w: 1.6, d: 0.8, h: 0.78, solid: true, label: "Desk", category: "furniture" },
  chair: { w: 0.6, d: 0.6, h: 0.95, solid: false, label: "Chair", category: "furniture" },
  table: { w: 1.8, d: 1.0, h: 0.78, solid: true, label: "Table", category: "furniture" },
  sofa: { w: 1.9, d: 0.85, h: 0.85, solid: true, label: "Sofa", category: "furniture", back: 0.45 },
  bench: { w: 1.8, d: 0.5, h: 0.48, solid: true, label: "Bench", category: "furniture" },
  bed: { w: 1.0, d: 1.9, h: 0.6, solid: true, label: "Bed", category: "furniture" },
  bookshelf: { w: 1.6, d: 0.45, h: 2.1, solid: true, label: "Bookshelf", category: "storage", back: 0.7 },
  shelf: { w: 1.8, d: 0.6, h: 2.2, solid: true, label: "Metal shelf", category: "storage", back: 0.65 },
  cabinet: { w: 1.0, d: 0.55, h: 1.3, solid: true, label: "Filing cabinet", category: "storage", back: 0.7 },
  locker: { w: 1.6, d: 0.55, h: 2.0, solid: true, label: "Lockers", category: "storage", back: 0.7 },
  crate: { w: 1.1, d: 1.1, h: 1.1, solid: true, label: "Crate", category: "industrial" },
  crates: { w: 1.8, d: 1.8, h: 2.1, solid: true, label: "Crate stack", category: "industrial" },
  barrel: { w: 0.75, d: 0.75, h: 1.0, solid: true, label: "Barrel", category: "industrial" },
  pallet: { w: 1.4, d: 1.2, h: 0.9, solid: true, label: "Pallet load", category: "industrial" },
  machine: { w: 1.8, d: 1.4, h: 1.9, solid: true, label: "Machine", category: "industrial" },
  tank: { w: 1.5, d: 1.5, h: 2.8, solid: true, label: "Tank", category: "industrial" },
  pipes: { w: 1.8, d: 0.5, h: 3.2, solid: true, label: "Pipes", category: "industrial", back: 0.7 },
  conveyor: { w: 1.9, d: 0.9, h: 0.85, solid: true, label: "Conveyor", category: "industrial" },
  forklift: { w: 1.2, d: 2.0, h: 2.0, solid: true, label: "Forklift", category: "industrial" },
  server: { w: 0.8, d: 1.0, h: 2.0, solid: true, label: "Server rack", category: "tech" },
  labtable: { w: 1.8, d: 0.9, h: 0.92, solid: true, label: "Lab bench", category: "tech" },
  specimen: { w: 1.0, d: 1.0, h: 2.3, solid: true, label: "Specimen tube", category: "tech" },
  console: { w: 1.6, d: 0.7, h: 1.1, solid: true, label: "Control console", category: "tech" },
  vending: { w: 0.9, d: 0.8, h: 1.9, solid: true, label: "Vending machine", category: "decor", back: 0.55 },
  counter: { w: 1.9, d: 0.7, h: 1.0, solid: true, label: "Counter", category: "furniture" },
  rack: { w: 1.6, d: 0.6, h: 1.6, solid: true, label: "Clothes rack", category: "decor" },
  planter: { w: 1.2, d: 1.2, h: 1.4, solid: true, label: "Planter", category: "decor" },
  plant: { w: 0.5, d: 0.5, h: 1.2, solid: false, label: "Potted plant", category: "decor" },
  whiteboard: { w: 1.8, d: 0.1, h: 1.2, solid: false, label: "Whiteboard", category: "decor", back: 0.9 },
  cones: { w: 0.5, d: 0.5, h: 0.7, solid: false, label: "Traffic cone", category: "decor" },
  trash: { w: 0.5, d: 0.5, h: 0.8, solid: false, label: "Bin", category: "decor" },
  pillar: { w: 0.8, d: 0.8, h: 4, solid: true, label: "Pillar", category: "structure" },
  railing: { w: 2.0, d: 0.15, h: 1.05, solid: true, label: "Railing", category: "structure" },
  fountain: { w: 3.0, d: 3.0, h: 0.7, solid: true, label: "Fountain", category: "decor" },
  car: { w: 1.9, d: 4.0, h: 1.5, solid: true, label: "Car", category: "industrial" },
};

/** Gameplay objects are also solids for collision. */
export const OBJECT_SOLIDS = {
  terminal: { w: 1.5, d: 0.8, h: 1.0 },
  pod: { w: 1.3, d: 1.3, h: 2.5 },
} as const;
