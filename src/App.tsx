import { AnimatePresence, MotionConfig, motion, useIsPresent, type Variants } from "motion/react";
import { lazy, Suspense, useEffect, useRef, useState, type ComponentType, type LazyExoticComponent, type ReactNode } from "react";
import { useReducedMotion } from "./lib/reducedMotion";
import { useThemeAttributes } from "./lib/theme";
import { useFullscreen } from "./lib/useFullscreen";
import { useIdle } from "./lib/useIdle";
import { useKeys } from "./lib/useKeys";
import { useViewport } from "./lib/useViewport";
import { useWakeLock } from "./lib/useWakeLock";
import { useNav, type Screen } from "./state/nav";
import { useSettings } from "./state/settings";
import { Backdrop, clearConfetti, cycleSound, ErrorBoundary, IconRefresh, SOUND_KEY, toast, ToastHost } from "./ui/components";

const LOADERS: Record<Screen, () => Promise<{ default: ComponentType }>> = {
  splash: () => import("./ui/screens/SplashScreen"),
  title: () => import("./ui/screens/TitleScreen"),
  category: () => import("./ui/screens/CategoryScreen"),
  difficulty: () => import("./ui/screens/DifficultyScreen"),
  game: () => import("./ui/screens/GameScreen"),
  results: () => import("./ui/screens/ResultsScreen"),
  leaderboard: () => import("./ui/screens/LeaderboardScreen"),
  host: () => import("./ui/screens/HostScreen"),
  showcase: () => import("./ui/screens/ShowcaseScreen"),
  settings: () => import("./ui/screens/SettingsScreen"),
};

const SCREENS = Object.fromEntries(Object.entries(LOADERS).map(([k, load]) => [k, lazy(load)])) as Record<
  Screen,
  LazyExoticComponent<ComponentType>
>;

/** Forward slides in from the right, back from the left. A tiny scale gives it some bounce. */
const SCREEN_VARIANTS: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: `${dir * 7}%`, scale: 0.96 }),
  center: { opacity: 1, x: "0%", scale: 1, transition: { type: "spring", stiffness: 420, damping: 36, mass: 0.8 } },
  exit: (dir: number) => ({ opacity: 0, x: `${dir * -5}%`, scale: 1.02, transition: { duration: 0.16, ease: "easeIn" } }),
};

/**
 * How long a new screen ignores taps. Kids double-tap, and the second tap would otherwise land on
 * whatever slid in under the finger (a ball they never chose, a category they never saw).
 */
const ENTER_GUARD_MS = 600;

/**
 * Screens a kid can walk away from. Left alone for this many times attractAfterSec, they go back
 * to the title, whose own idle timer then starts Show-off mode. Results waits longest so a kid
 * can still show the prize card.
 */
const IDLE_HOME: Partial<Record<Screen, number>> = { category: 2, difficulty: 2, leaderboard: 2, results: 3 };

/** +1 when navigation went deeper (or sideways), -1 when it went back. */
function useNavDirection(): number {
  const screen = useNav((s) => s.screen);
  const depth = useNav((s) => s.history.length);
  const last = useRef({ screen, depth, dir: 1 });
  if (last.current.screen !== screen) {
    last.current = { screen, depth, dir: depth < last.current.depth ? -1 : 1 };
  }
  return last.current.dir;
}

/** One screen in the transition. Takes no pointer input while it leaves or just after it arrives. */
function ScreenLayer({ dir, children }: { dir: number; children: ReactNode }) {
  const present = useIsPresent();
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setSettled(true), ENTER_GUARD_MS);
    return () => window.clearTimeout(id);
  }, []);
  return (
    <motion.div
      className="wtp-screen"
      custom={dir}
      variants={SCREEN_VARIANTS}
      initial="enter"
      animate="center"
      exit="exit"
      data-busy={!present || !settled || undefined}
    >
      {children}
    </motion.div>
  );
}

function useIdleHome(screen: Screen) {
  const attractAfterSec = useSettings((s) => s.attractAfterSec);
  const factor = IDLE_HOME[screen];
  const restart = useIdle(factor && attractAfterSec > 0 ? factor * attractAfterSec * 1000 : null, () => {
    clearConfetti();
    useNav.getState().home();
  });
  // Two idle screens in a row share one delay, so count again from each arrival.
  useEffect(() => restart(), [screen, restart]);
}

/**
 * A mirrored iPad held upright fills a narrow column of the projector. Ask the host to turn it,
 * from the bottom edge so the hint never hides the top HUD (progress dots, TOP TRAINERS).
 */
/** Screens where the bottom of the screen has room for the hint; results and showcase keep their buttons and call to action clear. */
const SIDEWAYS_HINT_SCREENS = new Set<Screen>(["title", "category", "difficulty", "game"]);

function useSidewaysHint(screen: Screen) {
  const projector = useSettings((s) => s.projector);
  const { w, h, orientation } = useViewport();
  const tabletUpright =
    projector && orientation === "portrait" && Math.min(w, h) >= 700 && typeof matchMedia === "function" && matchMedia("(any-pointer: coarse)").matches;
  const show = tabletUpright && SIDEWAYS_HINT_SCREENS.has(screen);
  useEffect(() => {
    if (show) return toast("Turn the iPad sideways for the big screen!", { tone: "hi", icon: <IconRefresh />, ms: 5000, place: "bottom" });
  }, [show]);
}

export default function App() {
  const screen = useNav((s) => s.screen);
  const dir = useNavDirection();
  const reduceMotion = useReducedMotion();
  const fullscreen = useFullscreen();
  useThemeAttributes();
  useWakeLock();
  useIdleHome(screen);
  useSidewaysHint(screen);
  // F toggles full screen on the projector laptop, M cycles the sound. Ignored while typing a name.
  useKeys({ f: () => void fullscreen.toggle(), [SOUND_KEY]: cycleSound });

  // Fetch every screen chunk once the first one is up, so later transitions never show a blank frame.
  useEffect(() => {
    const warm = () => Object.values(LOADERS).forEach((load) => void load().catch(() => {}));
    // Safari only shipped requestIdleCallback recently; a plain timeout is fine as a fallback.
    const id = setTimeout(() => (typeof requestIdleCallback === "function" ? requestIdleCallback(warm, { timeout: 2500 }) : warm()), 800);
    return () => clearTimeout(id);
  }, []);

  const Current = SCREENS[screen];
  return (
    <MotionConfig reducedMotion={reduceMotion ? "always" : "user"}>
      <Backdrop />
      <AnimatePresence initial={false} custom={dir}>
        <ScreenLayer key={screen} dir={dir}>
          <ErrorBoundary>
            <Suspense fallback={null}>
              <Current />
            </Suspense>
          </ErrorBoundary>
        </ScreenLayer>
      </AnimatePresence>
      <ToastHost />
    </MotionConfig>
  );
}
