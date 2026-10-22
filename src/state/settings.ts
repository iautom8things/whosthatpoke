import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PrizeTier } from "../game/scoring";

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

interface SettingsState extends Settings {
  update(patch: Partial<Settings>): void;
  reset(): void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      update: (patch) => set(patch),
      reset: () => set(DEFAULT_SETTINGS),
    }),
    { name: "wtp.settings.v1", version: 1 },
  ),
);
