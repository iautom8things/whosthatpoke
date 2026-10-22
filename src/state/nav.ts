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
    trapBrowserBack();
    set({ screen, history: opts?.replace ? history : [...history, current] });
  },
  back: () => {
    const { history } = get();
    const prev = history.at(-1) ?? "title";
    set({ screen: prev, history: history.slice(0, -1) });
  },
  home: () => set({ screen: "title", history: [] }),
}));

// ---------------------------------------------------------------------------
// Browser Back, Android's back gesture and Safari's edge swipe must not unload a game in progress.
// One extra history entry sits on top of the page's own; a Back pops it, we put it back and run the
// screen's own back instead.

let backHandler: (() => void) | null = null;

/**
 * Makes the browser's Back run `fn` (the screen's back button or Quit confirm) while it is
 * registered. Returns the unregister function.
 */
export function onBrowserBack(fn: () => void): () => void {
  backHandler = fn;
  return () => {
    if (backHandler === fn) backHandler = null;
  };
}

/** Without a registered handler these screens ignore Back: quitting them needs a confirm or a tap. */
const STAY_PUT: ReadonlySet<Screen> = new Set(["splash", "title", "game", "host", "results"]);

let trapped = false;
/** Called on the first navigation, after a tap, so browsers don't skip the entry as unprompted. */
function trapBrowserBack(): void {
  if (trapped || typeof window === "undefined" || typeof window.history?.pushState !== "function") return;
  trapped = true;
  // Same URL, query string included, so demo and QA links keep working.
  const stay = () => window.history.pushState({ wtp: "stay" }, "", window.location.href);
  stay();
  window.addEventListener("popstate", () => {
    stay();
    if (backHandler) return backHandler();
    const nav = useNav.getState();
    if (!STAY_PUT.has(nav.screen)) nav.back();
  });
}
