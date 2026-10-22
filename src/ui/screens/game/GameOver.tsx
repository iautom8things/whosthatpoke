import { AnimatePresence, motion } from "motion/react";
import { useCallback } from "react";
import { Button, Display, IconTrophy, PokeBall } from "../../components";
import { COPY } from "./copy";
import s from "./game.module.css";

export interface GameOverProps {
  open: boolean;
  caught: number;
  bestStreak: number;
  onContinue: () => void;
}

/** Survival's last beat: the screen dims, "Game over!" slams down, then on to the results. */
export function GameOver({ open, caught, bestStreak, onContinue }: GameOverProps) {
  // Not a kit Modal (it has no key layer), so it focuses its own button: Enter and screen readers land there.
  const focus = useCallback((el: HTMLButtonElement | null) => el?.focus({ preventScroll: true }), []);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="gameover"
          className={s.gameOver}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          role="alertdialog"
          aria-label={COPY.gameOver}
        >
          <motion.div
            className={s.gameOverCard}
            initial={{ scale: 2.6, rotate: -8, opacity: 0 }}
            animate={{ scale: 1, rotate: -3, opacity: 1, transition: { type: "spring", stiffness: 300, damping: 15, delay: 0.1 } }}
          >
            <span className={s.gameOverBall}>
              <PokeBall kind="poke" size="100%" empty animate="wobble" />
            </span>
            <Display size="hero" color="var(--bad)" as="h2" className={s.gameOverTitle}>
              {COPY.gameOver}
            </Display>
          </motion.div>
          <motion.div
            className={s.gameOverInfo}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0, transition: { delay: 0.55, type: "spring", stiffness: 400, damping: 22 } }}
          >
            <Display size="xl" color="var(--hi)">
              {COPY.caught(caught)}
            </Display>
            {bestStreak >= 2 && <p className={s.gameOverSub}>Best streak: {bestStreak} in a row</p>}
            <Button size="xl" variant="primary" icon={<IconTrophy />} onPress={onContinue} ref={focus}>
              {COPY.seeScore}
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
