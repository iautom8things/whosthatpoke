import { AnimatePresence, motion } from "motion/react";
import type { CSSProperties, Ref } from "react";
import type { Mon } from "../../../data/types";
import type { Round } from "../../../state/session";
import { useSwipe } from "../../../lib/useSwipe";
import { Burst, Display, Pill, PokeArt } from "../../components";
import { COPY } from "./copy";
import s from "./game.module.css";

export interface StageProps {
  mon: Mon | null;
  /** Changes per question, so the art swoops out and the next one swoops in. */
  artKey: string;
  ready: boolean;
  revealed: boolean;
  timedOut: boolean;
  round: Round | null;
  popup: boolean;
  streakBanner: number | null;
  survival: boolean;
  livesLeft: number;
  onSwipeNext?: () => void;
  ref?: Ref<HTMLDivElement>;
}

/** Swoops in from the upper right with a spin, lands on the sting's hit, leaves to the left. */
const ART_MOTION = {
  initial: { opacity: 0, x: "55%", y: "-30%", scale: 0.25, rotate: 28 },
  animate: { opacity: 1, x: "0%", y: "0%", scale: 1, rotate: 0, transition: { duration: 0.85, ease: [0.3, 1.45, 0.55, 1] as const } },
  exit: { opacity: 0, x: "-70%", y: "-8%", scale: 0.45, rotate: -24, transition: { duration: 0.26, ease: [0.55, 0, 1, 0.45] as const } },
};

const POP = {
  initial: { opacity: 0, scale: 0.4, y: 30 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { type: "spring", stiffness: 520, damping: 18 } as const },
  exit: { opacity: 0, y: -50, scale: 0.9, transition: { duration: 0.35, ease: "easeIn" } as const },
};

/** The burst behind the art takes the Pokémon's own type colors on the reveal. */
function burstColors(mon: Mon | null, revealed: boolean): { color?: string; color2?: string } {
  if (!mon || !revealed) return {};
  const [a, b] = mon.types;
  const ca = `var(--type-${a})`;
  return {
    color: `color-mix(in srgb, ${ca} 78%, #fff)`,
    color2: b ? `color-mix(in srgb, var(--type-${b}) 55%, #fff)` : `color-mix(in srgb, ${ca} 40%, #fff)`,
  };
}

export function Stage({ mon, artKey, ready, revealed, timedOut, round, popup, streakBanner, survival, livesLeft, onSwipeNext, ref }: StageProps) {
  const swipe = useSwipe({
    enabled: revealed && Boolean(onSwipeNext),
    onSwipe: (dir) => {
      if (dir === "left" || dir === "up") onSwipeNext?.();
    },
  });
  const drag: CSSProperties = swipe.dragging
    ? { transform: `translate(${Math.min(0, swipe.dx) * 0.55 + Math.max(0, swipe.dx) * 0.15}px, ${Math.min(0, swipe.dy) * 0.55}px) rotate(${swipe.dx / 28}deg)` }
    : {};

  const intensity = revealed ? 1 : ready ? 0.62 : 0.4;
  const score = round?.score;
  const showPoints = popup && revealed && round?.correct && score && score.points > 0;
  const showMiss = popup && revealed && round && !round.correct;

  return (
    <div ref={ref} className={s.stage} {...swipe.bind} style={swipe.bind.style} data-dragging={swipe.dragging || undefined}>
      <Burst intensity={intensity} {...burstColors(mon, revealed)} />
      <div className={s.drag} style={drag}>
        <AnimatePresence initial={true}>
          {mon && ready && (
            <motion.div key={artKey} className={s.art} {...ART_MOTION}>
              <PokeArt mon={mon} revealed={revealed} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {timedOut && !revealed && (
          <motion.div key="timeup" className={s.center} {...POP}>
            <Display size="3xl" color="var(--bad)" className={s.shout}>
              {COPY.timeUp}
            </Display>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPoints && score && (
          <motion.div key={`pts-${artKey}`} className={s.popup} {...POP} aria-live="polite">
            <Display size="3xl" color="var(--hi)" className={s.points}>
              +{score.points}
            </Display>
            <div className={s.breakdown}>
              <Pill tone="good" size="sm">
                {COPY.right} +{score.base}
              </Pill>
              {score.speedBonus > 0 && (
                <Pill tone="hi" size="sm">
                  {COPY.fast} +{score.speedBonus}
                </Pill>
              )}
              {score.streakBonus > 0 && (
                <Pill tone="accent" size="sm" icon="🔥">
                  {COPY.streakBonus} +{score.streakBonus}
                </Pill>
              )}
            </div>
          </motion.div>
        )}
        {showMiss && (
          <motion.div key={`miss-${artKey}`} className={s.popup} {...POP}>
            {survival ? (
              <>
                <Display size="xl" color="#fff" className={s.points}>
                  {COPY.ballsLeft(livesLeft)}
                </Display>
              </>
            ) : (
              !timedOut && (
                <Display size="xl" color="#fff" className={s.points}>
                  {COPY.niceTry}
                </Display>
              )
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {streakBanner !== null && (
          <motion.div
            key={`streak-${streakBanner}`}
            className={s.streak}
            initial={{ opacity: 0, scale: 2.2, rotate: -14 }}
            animate={{ opacity: 1, scale: 1, rotate: -5, transition: { type: "spring", stiffness: 420, damping: 14 } }}
            exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.25 } }}
          >
            <span className={s.streakFlame} aria-hidden="true">
              🔥
            </span>
            <span className={s.streakText}>
              <Display size="2xl" color="var(--hi)">
                {COPY.streak(streakBanner)}
              </Display>
              <Display size="lg" color="#fff">
                {COPY.streakCheer(streakBanner)}
              </Display>
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
