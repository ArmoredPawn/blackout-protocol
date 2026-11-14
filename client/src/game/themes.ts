import type { ThemeId } from "@bp/shared";

export interface ThemePalette {
  floor: string;
  floorAlt: string;
  grate: string;
  wall: string;
  wallBand: string;
  ceiling: string;
  trim: string;
  accent: string;
  outside: string;
  lamp: string;
  wood: string;
  fabric: string;
  metal: string;
  floorPattern: "tile" | "concrete" | "wood" | "carpet";
  floorAltPattern: "tile" | "concrete" | "wood" | "carpet";
  wallPattern: "panel" | "brick" | "concrete" | "plaster";
}

export const THEMES: Record<ThemeId, ThemePalette> = {
  facility: {
    floor: "#9aa3ae", floorAlt: "#c9d2dc", grate: "#5a6470", wall: "#d5dbe2", wallBand: "#3d6e9a", ceiling: "#b8c0c9",
    trim: "#525c68", accent: "#3cffd2", outside: "#1a222c", lamp: "#e6f0ff", wood: "#8a6a4a", fabric: "#36506e", metal: "#8e98a4",
    floorPattern: "tile", floorAltPattern: "tile", wallPattern: "panel",
  },
  industrial: {
    floor: "#6d6a63", floorAlt: "#8a8478", grate: "#4b4f55", wall: "#8f8a80", wallBand: "#c99a2e", ceiling: "#5a5852",
    trim: "#3a3a3a", accent: "#ffb020", outside: "#20201c", lamp: "#ffe2b0", wood: "#7a5a3a", fabric: "#4a4a40", metal: "#7d848c",
    floorPattern: "concrete", floorAltPattern: "concrete", wallPattern: "brick",
  },
  school: {
    floor: "#cfc6b5", floorAlt: "#a4744c", grate: "#6a6a6a", wall: "#e9e2cf", wallBand: "#2f6d4f", ceiling: "#efeadf",
    trim: "#6b5a44", accent: "#ffd84a", outside: "#24301f", lamp: "#fff4dc", wood: "#9c6b3f", fabric: "#7a2f2f", metal: "#9aa0a6",
    floorPattern: "tile", floorAltPattern: "wood", wallPattern: "plaster",
  },
  underground: {
    floor: "#4c5458", floorAlt: "#5c6a6e", grate: "#33393d", wall: "#6c7579", wallBand: "#7a2fbf", ceiling: "#3c4347",
    trim: "#2a2f33", accent: "#c45cff", outside: "#0b0d10", lamp: "#c8f0ff", wood: "#5a4636", fabric: "#2e3a40", metal: "#6f7b84",
    floorPattern: "concrete", floorAltPattern: "tile", wallPattern: "concrete",
  },
  mall: {
    floor: "#e6dfd3", floorAlt: "#b9a8c9", grate: "#7a7a7a", wall: "#f2efe9", wallBand: "#e0407a", ceiling: "#f6f3ee",
    trim: "#8c8c8c", accent: "#ff6fae", outside: "#2a2633", lamp: "#fff8ee", wood: "#a07850", fabric: "#5a3d7a", metal: "#b3b8bf",
    floorPattern: "tile", floorAltPattern: "carpet", wallPattern: "plaster",
  },
  warehouse: {
    floor: "#7a7770", floorAlt: "#6a6458", grate: "#4a4e52", wall: "#9aa1a6", wallBand: "#2e7dd1", ceiling: "#4a4d50",
    trim: "#3d4145", accent: "#ff7043", outside: "#181b1e", lamp: "#f2f6ff", wood: "#a07a4a", fabric: "#3a4650", metal: "#8d949b",
    floorPattern: "concrete", floorAltPattern: "concrete", wallPattern: "panel",
  },
  custom: {
    floor: "#9aa3ae", floorAlt: "#c9b79c", grate: "#5a6470", wall: "#d0d4da", wallBand: "#6a5acd", ceiling: "#b8c0c9",
    trim: "#525c68", accent: "#3cffd2", outside: "#1a222c", lamp: "#eef4ff", wood: "#8a6a4a", fabric: "#36506e", metal: "#8e98a4",
    floorPattern: "tile", floorAltPattern: "wood", wallPattern: "panel",
  },
};
