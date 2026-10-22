import { AnimatePresence, MotionConfig, motion, type Variants } from "motion/react";
import { lazy, Suspense, useEffect, useRef, type ComponentType, type LazyExoticComponent } from "react";
import { useReducedMotion } from "./lib/reducedMotion";
import { useThemeAttributes } from "./lib/theme";
import { useNav, type Screen } from "./state/nav";
import { Backdrop, ToastHost } from "./ui/components";

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

export default function App() {
  const screen = useNav((s) => s.screen);
  const dir = useNavDirection();
  const reduceMotion = useReducedMotion();
  useThemeAttributes();

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
        <motion.div key={screen} className="wtp-screen" custom={dir} variants={SCREEN_VARIANTS} initial="enter" animate="center" exit="exit">
          <Suspense fallback={null}>
            <Current />
          </Suspense>
        </motion.div>
      </AnimatePresence>
      <ToastHost />
    </MotionConfig>
  );
}
