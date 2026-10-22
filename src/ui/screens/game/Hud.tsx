import { AnimatePresence, motion } from "motion/react";
import type { Round } from "../../../state/session";
import { Display, Lives, Pill, ProgressDots, Stat } from "../../components";
import s from "./game.module.css";

export interface HudProps {
  survival: boolean;
  total: number;
  /** 0-based question on screen. */
  index: number;
  rounds: readonly Round[];
  lives: number;
  maxLives: number;
  caught: number;
}

/** Header middle: round dots (classic) or Poké Ball lives and the catch count (survival). */
export function HudCenter({ survival, total, index, rounds, lives, maxLives, caught }: HudProps) {
  if (survival) {
    return (
      <div className={s.hudCenter}>
        <Lives total={maxLives} remaining={lives} />
        <Pill tone="hi" size="md" className={s.caught} icon="★">
          {caught}
        </Pill>
      </div>
    );
  }
  return (
    <div className={s.hudCenter}>
      <ProgressDots total={total} current={index} results={rounds.map((r) => r.correct)} className={s.dotsHeader} />
      <Display size="lg" className={s.countNarrow}>
        {Math.min(index + 1, total)}
        <span className={s.of}>/{total}</span>
      </Display>
    </div>
  );
}

/** Narrow portrait phones: the dots get their own full-width row under the header. */
export function DotsRow({ total, index, rounds }: Pick<HudProps, "total" | "index" | "rounds">) {
  return (
    <div className={s.dotsRow}>
      <ProgressDots total={total} current={index} results={rounds.map((r) => r.correct)} showCount={false} />
    </div>
  );
}

/** Header right: the score, with a flame badge once a streak gets going. */
export function HudScore({ score, streak }: { score: number; streak: number }) {
  return (
    <div className={s.hudScore}>
      <AnimatePresence>
        {streak >= 2 && (
          <motion.span
            key="flame"
            className={s.flame}
            initial={{ scale: 0, rotate: -30 }}
            animate={{ scale: 1, rotate: 0, transition: { type: "spring", stiffness: 600, damping: 15 } }}
            exit={{ scale: 0, transition: { duration: 0.15 } }}
            aria-label={`${streak} in a row`}
          >
            <span aria-hidden="true">🔥</span>
            <span className={s.flameCount}>{streak}</span>
          </motion.span>
        )}
      </AnimatePresence>
      <Stat value={score} label="Score" size="md" />
    </div>
  );
}
