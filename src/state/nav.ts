import { create } from "zustand";

export type Screen =
  | "splash" // tap to start (unlocks audio)
  | "title" // main menu
  | "category" // pick a theme: region, type, legendary...
  | "difficulty" // Poké Ball ... Master Ball
  | "game" // classic and survival play
  | "results" // score, prize tier, name entry
  | "leaderboard"
  | "host" // parent-judged swipe mode
  | "showcase" // attract mode for the projector
  | "settings"; // host panel

interface NavState {
  screen: Screen;
  history: Screen[];
  go(screen: Screen, opts?: { replace?: boolean }): void;
  back(): void;
  /** Return to the title screen and forget history. */
  home(): void;
}

export const useNav = create<NavState>((set, get) => ({
  screen: "splash",
  history: [],
  go: (screen, opts) => {
    const { screen: current, history } = get();
    if (screen === current) return;
    set({ screen, history: opts?.replace ? history : [...history, current] });
  },
  back: () => {
    const { history } = get();
    const prev = history.at(-1) ?? "title";
    set({ screen: prev, history: history.slice(0, -1) });
  },
  home: () => set({ screen: "title", history: [] }),
}));
