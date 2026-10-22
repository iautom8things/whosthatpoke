import type { CSSProperties, Ref } from "react";
import { audio, type SfxId } from "../../audio";
import { haptic } from "../../lib/haptic";
import { cx } from "./cx";
import { IconCheck, IconX } from "./icons";
import s from "./ChoiceButton.module.css";

/**
 * idle     waiting for a pick
 * picked   the player's pick, before the reveal
 * correct  the right answer (after the reveal)
 * wrong    the player's pick when it was wrong
 * dimmed   every other answer after the reveal
 */
export type ChoiceState = "idle" | "picked" | "correct" | "wrong" | "dimmed";

export interface ChoiceButtonProps {
  label: string;
  state?: ChoiceState;
  /** Keyboard hint shown in the corner badge, e.g. 1-4. Hidden on touch-only devices. */
  hint?: string | number;
  onPress?: () => void;
  /** Only "idle" buttons take presses; this also blocks them (e.g. during the intro). */
  disabled?: boolean;
  /** Default "select". null = silent. */
  sfx?: SfxId | null;
  className?: string;
  style?: CSSProperties;
  ref?: Ref<HTMLButtonElement>;
}

const STATE_LABEL: Partial<Record<ChoiceState, string>> = {
  correct: "correct answer",
  wrong: "wrong answer",
  picked: "your pick",
};

/** Big answer button for 2x2 or 1x4 grids. Long names shrink to fit; nothing clips. */
export function ChoiceButton({ label, state = "idle", hint, onPress, disabled, sfx = "select", className, style, ref }: ChoiceButtonProps) {
  const live = state === "idle" && !disabled;
  const suffix = STATE_LABEL[state];
  return (
    <button
      ref={ref}
      type="button"
      className={cx(s.choice, className)}
      data-state={state}
      data-long={label.length > 10 || undefined}
      aria-disabled={!live || undefined}
      aria-label={suffix ? `${label}, ${suffix}` : label}
      style={{ ...style, ["--len" as string]: Math.max(label.length, 7) }}
      onClick={() => {
        if (!live) return;
        if (sfx) audio.sfx(sfx);
        haptic("select");
        onPress?.();
      }}
    >
      <span className={s.name}>{label}</span>
      {state === "correct" ? (
        <span className={s.badge} data-kind="good" aria-hidden="true">
          <IconCheck />
        </span>
      ) : state === "wrong" ? (
        <span className={s.badge} data-kind="bad" aria-hidden="true">
          <IconX />
        </span>
      ) : hint !== undefined ? (
        <span className={s.badge} data-kind="hint" aria-hidden="true">
          {hint}
        </span>
      ) : null}
    </button>
  );
}
