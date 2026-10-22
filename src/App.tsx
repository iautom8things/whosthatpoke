import { lazy, Suspense, useEffect, type ComponentType, type LazyExoticComponent } from "react";
import { useNav, type Screen } from "./state/nav";
import { useSettings } from "./state/settings";

const SCREENS: Record<Screen, LazyExoticComponent<ComponentType>> = {
  splash: lazy(() => import("./ui/screens/SplashScreen")),
  title: lazy(() => import("./ui/screens/TitleScreen")),
  category: lazy(() => import("./ui/screens/CategoryScreen")),
  difficulty: lazy(() => import("./ui/screens/DifficultyScreen")),
  game: lazy(() => import("./ui/screens/GameScreen")),
  results: lazy(() => import("./ui/screens/ResultsScreen")),
  leaderboard: lazy(() => import("./ui/screens/LeaderboardScreen")),
  host: lazy(() => import("./ui/screens/HostScreen")),
  showcase: lazy(() => import("./ui/screens/ShowcaseScreen")),
  settings: lazy(() => import("./ui/screens/SettingsScreen")),
};

export default function App() {
  const screen = useNav((s) => s.screen);
  const theme = useSettings((s) => s.theme);
  const projector = useSettings((s) => s.projector);
  const reduceMotion = useSettings((s) => s.reduceMotion);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.projector = projector ? "on" : "off";
    root.dataset.reduceMotion = reduceMotion ? "on" : "off";
  }, [theme, projector, reduceMotion]);

  const Current = SCREENS[screen];
  return (
    <Suspense fallback={null}>
      <Current key={screen} />
    </Suspense>
  );
}
