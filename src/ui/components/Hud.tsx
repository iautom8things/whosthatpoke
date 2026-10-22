import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useReducedMotion } from "../../lib/reducedMotion";
import { cx } from "./cx";
import { IconCheck, IconX } from "./icons";
import { PokeBall, type BallKind } from "./PokeBall";
import s from "./Hud.module.css";

/* ================= Stat ================= */

/** Animates a number toward `value`. Returns the number to show this frame. */
export function useCountUp(value: number, ms = 700): number {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (reduce || ms <= 0) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const v = Math.round(a + (value - a) * (1 - Math.pow(1 - t, 3)));
      from.current = v;
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms, reduce]);
  return shown;
}

export interface StatProps {
  value: number | string;
  label: ReactNode;
  /** Number color. Default --hi (yellow). */
  color?: string;
  size?: "md" | "lg" | "xl";
  /** Roll numbers up when they change. Default true for numbers. */
  countUp?: boolean;
  className?: string;
}

/** Big display number with a small label under it: score, streak, rank. */
export function Stat({ value, label, color, size = "lg", countUp = true, className }: StatProps) {
  const numeric = typeof value === "number";
  const rolled = useCountUp(numeric ? value : 0, numeric && countUp ? 700 : 0);
  const text = numeric ? (countUp ? rolled : value).toLocaleString() : value;
  return (
    <div className={cx(s.stat, className)} data-size={size}>
      <span className={cx("wtp-display", s.value)} style={color ? ({ "--display-fill": color } as CSSProperties) : undefined}>
        {text}
      </span>
      <span className={s.label}>{label}</span>
    </div>
  );
}

/* ================= ProgressDots ================= */

/** true = correct, false = wrong, null/undefined = not played yet. */
export type RoundResult = boolean | null | undefined;

export interface ProgressDotsProps {
  total: number;
  /** 0-based index of the question on screen. */
  current: number;
  results?: readonly RoundResult[];
  /** Show "4 / 10" next to the dots. Default true. */
  showCount?: boolean;
  className?: string;
}

/** Round tracker: past rounds green or red, current one glowing, future ones hollow. */
export function ProgressDots({ total, current, results = [], showCount = true, className }: ProgressDotsProps) {
  const dots = Array.from({ length: total }, (_, i) => {
    const r = results[i];
    return r === true ? "good" : r === false ? "bad" : i === current ? "current" : i < current ? "done" : "todo";
  });
  return (
    <div className={cx(s.progress, className)} role="img" aria-label={`Question ${Math.min(current + 1, total)} of ${total}`}>
      <ol className={s.dots} style={{ "--n": total } as CSSProperties}>
        {dots.map((state, i) => (
          <li key={i} className={s.dot} data-state={state}>
            {state === "good" && <IconCheck />}
            {state === "bad" && <IconX />}
          </li>
        ))}
      </ol>
      {showCount && (
        <span className={cx("wtp-display", s.count)}>
          {Math.min(current + 1, total)}
          <span className={s.of}>/{total}</span>
        </span>
      )}
    </div>
  );
}

/* ================= Timers ================= */

export interface TimerProps {
  /** 1 = full, 0 = out of time. */
  fraction: number;
  /** Pulse red (last seconds). */
  urgent?: boolean;
  /** Optional text, e.g. seconds left. */
  label?: ReactNode;
  className?: string;
}

function level(f: number): "high" | "mid" | "low" {
  return f > 0.5 ? "high" : f > 0.25 ? "mid" : "low";
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));

/** Horizontal countdown bar. Visual only; the screen owns the clock. */
export function TimerBar({ fraction, urgent, label, className }: TimerProps) {
  const f = clamp01(fraction);
  return (
    <div className={cx(s.bar, className)} data-level={level(f)} data-urgent={urgent || undefined} aria-hidden="true">
      <div className={s.barFill} style={{ transform: `scaleX(${f})` }} />
      {label !== undefined && <span className={cx("wtp-display", s.barLabel)}>{label}</span>}
    </div>
  );
}

export interface TimerRingProps extends TimerProps {
  /** CSS length. Default 4.5em. */
  size?: string;
}

/** Circular countdown with an optional number in the middle. Visual only. */
export function TimerRing({ fraction, urgent, label, size = "4.5em", className }: TimerRingProps) {
  const f = clamp01(fraction);
  const C = 2 * Math.PI * 40;
  return (
    <div className={cx(s.ring, className)} data-level={level(f)} data-urgent={urgent || undefined} style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 100 100">
        <circle className={s.ringRim} cx="50" cy="50" r="50" />
        <circle className={s.ringTrack} cx="50" cy="50" r="40" />
        <circle className={s.ringFill} cx="50" cy="50" r="40" strokeDasharray={C} strokeDashoffset={C * (1 - f)} />
      </svg>
      {label !== undefined && <span className={cx("wtp-display", s.ringLabel)}>{label}</span>}
    </div>
  );
}

/* ================= Lives ================= */

export interface LivesProps {
  total: number;
  remaining: number;
  ball?: BallKind;
  className?: string;
}

/** Survival lives as Poké Balls. A lost one shakes, then greys out. */
export function Lives({ total, remaining, ball = "poke", className }: LivesProps) {
  return (
    <div className={cx(s.lives, className)} role="img" aria-label={`${remaining} of ${total} lives left`}>
      {Array.from({ length: total }, (_, i) => {
        const alive = i < remaining;
        return (
          <span key={i} className={s.life} data-alive={alive || undefined}>
            <PokeBall kind={ball} size="100%" empty={!alive} />
          </span>
        );
      })}
    </div>
  );
}
