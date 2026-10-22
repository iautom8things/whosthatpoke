import { AnimatePresence, motion } from "motion/react";
import { Button, Display, IconNext, IconTrophy, TimerBar } from "../../components";
import { useCountdownView, type Countdown } from "./countdown";
import { COPY } from "./copy";
import { URGENT_SECONDS } from "./useGameLoop";
import s from "./game.module.css";

export interface ActionBarProps {
  /** null when the timer is off. */
  clock: Countdown | null;
  totalMs: number;
  showTimer: boolean;
  showNext: boolean;
  last: boolean;
  auto: Countdown | null;
  autoStopped: boolean;
  onNext: () => void;
}

/** The slot under the answers: the clock while asking, the Next button on the reveal. Same height both ways. */
export function ActionBar({ clock, totalMs, showTimer, showNext, last, auto, autoStopped, onNext }: ActionBarProps) {
  return (
    <div className={s.action}>
      {showTimer && <Clock clock={clock} totalMs={totalMs} />}
      <AnimatePresence>
        {showNext && (
          <motion.div
            key="next"
            className={s.nextWrap}
            initial={{ opacity: 0, y: 24, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 480, damping: 20, delay: 0.15 } }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
          >
            <Button
              size="lg"
              block
              variant={last ? "success" : "primary"}
              icon={last ? <IconTrophy /> : <IconNext />}
              sfx="tap"
              onPress={onNext}
              className={s.next}
            >
              {last ? COPY.results : COPY.next}
              {auto && !autoStopped && <Drain auto={auto} />}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Clock({ clock, totalMs }: { clock: Countdown | null; totalMs: number }) {
  const view = useCountdownView(clock);
  // Before the clock exists (the intro) it shows full.
  const seconds = clock ? view.seconds : Math.ceil(totalMs / 1000);
  const fraction = clock ? view.fraction : 1;
  const urgent = seconds <= URGENT_SECONDS;
  return (
    <div className={s.clock} data-urgent={urgent || undefined} role="timer" aria-label={`${seconds} seconds left`}>
      <Display size="xl" color={urgent ? "var(--bad)" : undefined} className={s.seconds}>
        {seconds}
      </Display>
      <TimerBar fraction={fraction} urgent={urgent && seconds > 0} className={s.bar} />
    </div>
  );
}

function Drain({ auto }: { auto: Countdown }) {
  const view = useCountdownView(auto, 240);
  return (
    <span className={s.drain} aria-hidden="true">
      <span className={s.drainFill} style={{ transform: `scaleX(${view.fraction})` }} />
    </span>
  );
}
