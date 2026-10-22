import { useEffect } from "react";
import { useSettings } from "../state/settings";

const THEME_COLOR = { spooky: "#0a0420", classic: "#05328e" } as const;

/**
 * Mirrors theme, projector and reduceMotion settings onto <html> as data attributes,
 * which tokens.css and global.css key off. Call once at the app root (App, Gallery).
 */
export function useThemeAttributes(): void {
  const theme = useSettings((s) => s.theme);
  const projector = useSettings((s) => s.projector);
  const reduceMotion = useSettings((s) => s.reduceMotion);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.projector = projector ? "on" : "off";
    root.dataset.reduceMotion = reduceMotion ? "on" : "off";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme] ?? THEME_COLOR.spooky);
  }, [theme, projector, reduceMotion]);
}
