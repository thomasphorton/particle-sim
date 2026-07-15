import { MaterialId } from "./materials";
import type { Character } from "./character";

export type ToolMode = "editor" | "place" | "pickaxe";

export interface InventoryCounts {
  flowers: number;
  [key: string]: number; // dynamic material inventory
}

export type HotbarItem = { kind: "pickaxe" } | { kind: "empty" };

export interface SnipAnimation {
  px: number;
  py: number;
  startTime: number;
}

export interface SimState {
  selectedMaterial: MaterialId;
  brushSize: number;
  paused: boolean;
  /** Grid-space cursor position, for the placement preview. Null when the pointer is off-canvas. */
  hover: { x: number; y: number } | null;
  /** Raw pixel position on the canvas element, for drawing custom cursors. */
  hoverPixel: { x: number; y: number } | null;
  inventory: InventoryCounts;
  /** 10-slot hotbar. */
  hotbar: HotbarItem[];
  /** Currently selected hotbar slot (0-9). */
  activeSlot: number;
  /** Active snip animation, if any. */
  snip: SnipAnimation | null;
  /** The player character. */
  character: Character | null;
  /** Current tool mode. */
  toolMode: ToolMode;
}

export const state: SimState = {
  selectedMaterial: MaterialId.Sand,
  brushSize: 4,
  paused: false,
  hover: null,
  hoverPixel: null,
  inventory: { flowers: 0 },
  hotbar: [
    { kind: "pickaxe" },
    { kind: "empty" },
    { kind: "empty" },
    { kind: "empty" },
    { kind: "empty" },
    { kind: "empty" },
    { kind: "empty" },
    { kind: "empty" },
    { kind: "empty" },
    { kind: "empty" },
  ],
  activeSlot: 0,
  snip: null,
  character: null,
  toolMode: "pickaxe",
};

/** Returns true if the currently selected hotbar item is a pickaxe. */
export function hasPickaxeEquipped(): boolean {
  return state.hotbar[state.activeSlot]?.kind === "pickaxe";
}
