import type { CSSProperties } from "react";
import { cx } from "./cx";
import s from "./Burst.module.css";

export interface BurstProps {
  /** Slow rotation. Default true. Stops under reduced motion. */
  spinning?: boolean;
  /** 0..1, how strong the rays and the core glow are. Default 1. Raise it on the reveal. */
  intensity?: number;
  /** Ray colors. Defaults come from the theme (--burst-a / --burst-b). */
  color?: string;
  color2?: string;
  /** Number of ray pairs. Default 14. */
  rays?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * The rotating sunburst behind a silhouette. Fills its nearest positioned ancestor
 * (position: absolute; inset: 0), so put it first inside a `position: relative` stage.
 */
export function Burst({ spinning = true, intensity = 1, color, color2, rays = 14, className, style }: BurstProps) {
  const vars = {
    "--i": Math.max(0, Math.min(1, intensity)),
    "--ray": `${360 / rays / 2}deg`,
    ...(color && { "--burst-a": color }),
    ...(color2 && { "--burst-b": color2 }),
  } as CSSProperties;
  return (
    <div className={cx(s.burst, className)} style={{ ...vars, ...style }} data-spinning={spinning || undefined} aria-hidden="true">
      <div className={s.rays} />
      <div className={s.core} />
    </div>
  );
}
