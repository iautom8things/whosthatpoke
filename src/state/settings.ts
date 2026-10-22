import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { PrizeTier } from "../game/scoring";
import { browserStorage, noteFailedWrite } from "../game/storage";

export type Theme = "spooky" | "classic";

export interface Settings {
  musicVolume: number;
  sfxVolume: number;
  /** Announcer says "Who's that Pokémon?" and "It's Pikachu!". */
  voice: boolean;
  /** Questions per classic or host game. */
  rounds: number;
  timer: boolean;
  /** Move on from the reveal by itself after a few seconds. */
  autoAdvance: boolean;
  theme: Theme;
  /** Bigger type and stronger contrast for a washed-out projector. */
  projector: boolean;
  /** Seconds idle on the title screen before attract mode starts. 0 = never. */
  attractAfterSec: number;
  /** null = DEFAULT_PRIZE_TIERS. */
  prizeTiers: PrizeTier[] | null;
  reduceMotion: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  musicVolume: 0.6,
  sfxVolume: 0.8,
  voice: true,
  rounds: 10,
  timer: true,
  autoAdvance: true,
  theme: "spooky",
  projector: false,
  attractAfterSec: 60,
  prizeTiers: null,
  reduceMotion: false,
};

export const SETTINGS_KEY = "wtp.settings.v1";

interface SettingsState extends Settings {
  update(patch: Partial<Settings>): void;
  reset(): void;
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isTier = (v: unknown): v is PrizeTier => {
  const t = v as Record<string, unknown> | null;
  return typeof t === "object" && t !== null && isNum(t.minCorrect) && t.minCorrect >= 0 && isStr(t.title) && isStr(t.reward) && isStr(t.emoji) && isStr(t.color);
};
const CHECKS: { [K in keyof Settings]: (v: unknown) => boolean } = {
  musicVolume: (v) => isNum(v) && v >= 0 && v <= 1,
  sfxVolume: (v) => isNum(v) && v >= 0 && v <= 1,
  voice: (v) => typeof v === "boolean",
  rounds: (v) => isNum(v) && Number.isInteger(v) && v >= 1 && v <= 50,
  timer: (v) => typeof v === "boolean",
  autoAdvance: (v) => typeof v === "boolean",
  theme: (v) => v === "spooky" || v === "classic",
  projector: (v) => typeof v === "boolean",
  attractAfterSec: (v) => isNum(v) && v >= 0,
  prizeTiers: (v) => v === null || (Array.isArray(v) && v.length > 0 && v.every(isTier)),
  reduceMotion: (v) => typeof v === "boolean",
};

/** The stored fields that have the right type and range. Anything else falls back to the default. */
export function validSettings(stored: unknown): Partial<Settings> {
  if (typeof stored !== "object" || stored === null) return {};
  const data = stored as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(CHECKS) as (keyof Settings)[]) {
    if (key in data && CHECKS[key](data[key])) out[key] = data[key];
  }
  return out as Partial<Settings>;
}

/** True when this device has saved settings before (the host has made choices). */
export function hasStoredSettings(): boolean {
  try {
    return browserStorage()?.getItem(SETTINGS_KEY) != null;
  } catch {
    return false;
  }
}

// Storage that never throws: a full or blocked localStorage keeps the settings for this visit only.
const safeStorage = createJSONStorage(() => ({
  getItem: (name: string) => {
    try {
      return browserStorage()?.getItem(name) ?? null;
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: string) => {
    try {
      browserStorage()?.setItem(name, value);
    } catch {
      noteFailedWrite();
    }
  },
  removeItem: (name: string) => {
    try {
      browserStorage()?.removeItem(name);
    } catch {
      // nothing to clean up then
    }
  },
}));

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      update: (patch) => set(patch),
      reset: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: SETTINGS_KEY,
      version: 1,
      storage: safeStorage,
      // Whatever an older build or a hand edit left behind, keep only the fields that still make sense.
      migrate: (stored) => validSettings(stored) as SettingsState,
      merge: (stored, current) => ({ ...current, ...validSettings(stored) }),
    },
  ),
);
