import { AnimatePresence, motion } from "motion/react";
import type { CSSProperties } from "react";
import type { PrizeTier } from "../../../game/scoring";
import { Burst, PokeBall, type BallKind } from "../../components";
import { rewardSize } from "./model";
import s from "./PrizeCard.module.css";

export interface PrizeCardProps {
  tier: PrizeTier;
  /** false = the closed ball wobbling ("Your prize is..."), true = the prize. */
  open: boolean;
  ball: BallKind;
  /** 0..1, how fancy the reveal is (top prize = 1). */
  level: number;
  className?: string;
}

/** The prize ticket. Readable from the candy bowl: one emoji, one title, one reward. */
export function PrizeCard({ tier, open, ball, level, className }: PrizeCardProps) {
  return (
    <section
      className={`${s.card} ${className ?? ""}`}
      data-open={open || undefined}
      style={{ "--tier": tier.color } as CSSProperties}
      aria-live="polite"
      aria-label={open ? `${tier.title}. ${tier.reward}` : "Your prize is coming"}
    >
      <div className={s.stage}>
        <Burst intensity={open ? 0.6 + 0.4 * level : 0.25} spinning color="rgb(255 255 255 / 0.55)" color2="rgb(255 255 255 / 0)" rays={open ? 12 : 9} />
        <AnimatePresence mode="popLayout" initial={false}>
          {open ? (
            <motion.span
              key="emoji"
              className={s.emoji}
              initial={{ scale: 0.2, rotate: -25, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 380, damping: 13 }}
              aria-hidden="true"
            >
              {tier.emoji}
            </motion.span>
          ) : (
            <motion.span key="ball" className={s.ball} exit={{ scale: 1.7, opacity: 0 }} transition={{ duration: 0.22 }} aria-hidden="true">
              <PokeBall kind={ball} size="100%" animate="wobble" />
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className={s.ribbon}>
        <span className="wtp-display">{open ? tier.title : "Your prize is…"}</span>
      </div>

      <p key={open ? "reward" : "mystery"} className={`wtp-display ${s.reward}`} data-len={rewardSize(tier.reward)} aria-hidden={!open || undefined}>
        {open ? tier.reward : "? ? ?"}
      </p>

      <p className={s.show}>
        <span aria-hidden="true">👀</span> Show this screen to get your prize!
      </p>
    </section>
  );
}
