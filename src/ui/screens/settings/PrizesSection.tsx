// Prize tiers: what a kid wins for each score. Edits save as you type; the ladder previews them live.
import { useState, type CSSProperties } from "react";
import { audio } from "../../../audio";
import { DEFAULT_PRIZE_TIERS, prizeFor, type PrizeTier } from "../../../game/scoring";
import { haptic } from "../../../lib/haptic";
import { useSettings } from "../../../state/settings";
import { Button, ConfirmDialog, Display, IconRefresh, Modal, cx } from "../../components";
import { SectionTitle, Stepper, sliderKeys, useStepDrag } from "./controls";
import s from "./Settings.module.css";

const EMOJI = ["🍬", "🍭", "🍫", "🍩", "🧁", "🍪", "🍿", "🍎", "🎃", "👻", "🦇", "🕷️", "⭐", "🏆", "👑", "🥇", "🎁", "💎"];

function useTiers(): PrizeTier[] {
  const custom = useSettings((st) => st.prizeTiers);
  return custom && custom.length > 0 ? custom : [...DEFAULT_PRIZE_TIERS];
}

function TierEditor({ tier, index, onChange, onPickEmoji }: { tier: PrizeTier; index: number; onChange(patch: Partial<PrizeTier>): void; onPickEmoji(): void }) {
  const fallback = DEFAULT_PRIZE_TIERS[index] ?? DEFAULT_PRIZE_TIERS[0];
  return (
    <li className={s.tier} style={{ "--c": tier.color } as CSSProperties}>
      <button type="button" className={s.emojiButton} aria-label={`Prize icon ${tier.emoji}. Change it`}
        onClick={() => {
          audio.sfx("tap");
          haptic("tap");
          onPickEmoji();
        }}
      >
        {tier.emoji}
      </button>
      <input
        className={cx(s.input, s.tierTitle)}
        value={tier.title}
        maxLength={24}
        placeholder="Prize name"
        aria-label={`Prize ${index + 1} name`}
        enterKeyHint="next"
        onChange={(e) => onChange({ title: e.target.value })}
        onBlur={(e) => onChange({ title: e.target.value.trim() || fallback.title })}
      />
      <input
        className={cx(s.input, s.tierReward)}
        value={tier.reward}
        maxLength={40}
        placeholder="What they get"
        aria-label={`Prize ${index + 1} reward`}
        enterKeyHint="done"
        onChange={(e) => onChange({ reward: e.target.value })}
        onBlur={(e) => onChange({ reward: e.target.value.trim() || fallback.reward })}
      />
      <div className={s.tierNeed}>
        <span className={s.tierNeedLabel}>Needs</span>
        <Stepper
          label={`Correct answers for prize ${index + 1}`}
          value={tier.minCorrect}
          min={0}
          max={10}
          onChange={(n) => onChange({ minCorrect: n })}
          display={
            <>
              {tier.minCorrect}
              <small>/10</small>
            </>
          }
        />
      </div>
    </li>
  );
}

/** Every possible score as a rung, colored by the prize it wins. Tap or drag to try one. */
function Ladder({ tiers, rounds }: { tiers: PrizeTier[]; rounds: number }) {
  const [score, setScore] = useState(() => Math.ceil(rounds / 2));
  const tryScore = Math.min(score, rounds);
  const prize = prizeFor(tryScore, rounds, tiers);
  const pick = (n: number) => {
    setScore(n);
    audio.sfx("tick");
  };
  const drag = useStepDrag(rounds, pick, "cells");
  return (
    <div className={s.preview}>
      <div
        className={s.ladder}
        role="slider"
        tabIndex={0}
        aria-label="Try a score"
        aria-valuemin={0}
        aria-valuemax={rounds}
        aria-valuenow={tryScore}
        aria-valuetext={`${tryScore} of ${rounds}: ${prize.reward}`}
        style={{ "--n": rounds + 1 } as CSSProperties}
        onKeyDown={sliderKeys(tryScore, rounds, pick)}
        {...drag}
      >
        {Array.from({ length: rounds + 1 }, (_, n) => {
          const tier = prizeFor(n, rounds, tiers);
          const first = n === 0 || prizeFor(n - 1, rounds, tiers) !== tier;
          return (
            <span key={n} className={s.rung} data-on={n === tryScore || undefined} style={{ "--c": tier.color } as CSSProperties}>
              <span className={s.rungEmoji}>{first ? tier.emoji : ""}</span>
              <span className={s.rungBox}>{n}</span>
            </span>
          );
        })}
      </div>
      <div className={s.prizeResult} style={{ "--c": prize.color } as CSSProperties} aria-live="polite">
        <span className={s.prizeEmoji} aria-hidden="true">
          {prize.emoji}
        </span>
        <span className={s.prizeText}>
          <Display size="lg" color={prize.color}>
            {tryScore}/{rounds} <span aria-hidden="true">→</span> {prize.title}
          </Display>
          <span className={s.prizeReward}>{prize.reward}</span>
        </span>
      </div>
    </div>
  );
}

export function PrizesSection() {
  const tiers = useTiers();
  const rounds = useSettings((st) => st.rounds);
  const custom = useSettings((st) => st.prizeTiers !== null);
  const update = useSettings((st) => st.update);
  const [picking, setPicking] = useState<number | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const patch = (i: number, change: Partial<PrizeTier>) => update({ prizeTiers: tiers.map((t, j) => (j === i ? { ...t, ...change } : t)) });

  return (
    <>
      <SectionTitle note={rounds === 10 ? "Set what kids win for each score. Scores are out of 10." : `Scores are set out of 10 and scale to ${rounds}-question games.`}>
        Prizes
      </SectionTitle>
      <Ladder tiers={tiers} rounds={rounds} />
      <ol className={s.tiers}>
        {tiers.map((tier, i) => (
          <TierEditor key={i} tier={tier} index={i} onChange={(c) => patch(i, c)} onPickEmoji={() => setPicking(i)} />
        ))}
      </ol>
      {custom && (
        <div className={s.sectionFoot}>
          <Button variant="ghost" icon={<IconRefresh />} onPress={() => setConfirmReset(true)}>
            Reset prizes
          </Button>
        </div>
      )}

      <Modal open={picking !== null} onClose={() => setPicking(null)} title="Pick a prize icon" variant="sheet">
        <div className={s.emojiGrid}>
          {EMOJI.map((e) => (
            <button
              key={e}
              type="button"
              className={s.emojiPick}
              aria-pressed={picking !== null && tiers[picking]?.emoji === e}
              onClick={() => {
                audio.sfx("select");
                haptic("select");
                if (picking !== null) patch(picking, { emoji: e });
                setPicking(null);
              }}
            >
              {e}
            </button>
          ))}
        </div>
      </Modal>
      <ConfirmDialog
        open={confirmReset}
        tone="danger"
        title="Reset prizes?"
        message="Names, rewards and scores go back to the starting set."
        confirmLabel="Reset"
        cancelLabel="Keep mine"
        onConfirm={() => {
          update({ prizeTiers: null });
          setConfirmReset(false);
        }}
        onCancel={() => setConfirmReset(false)}
      />
    </>
  );
}
