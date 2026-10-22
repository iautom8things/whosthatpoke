import type { CSSProperties, ReactNode } from "react";
import { audio, type SfxId } from "../../audio";
import type { PokeType } from "../../data/types";
import { haptic } from "../../lib/haptic";
import { cx } from "./cx";
import s from "./Badges.module.css";

export interface TypeBadgeProps {
  type: PokeType;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/** Pokémon type pill in the official type color (tokens --type-*). */
export function TypeBadge({ type, size = "md", className }: TypeBadgeProps) {
  return (
    <span className={cx(s.type, className)} data-size={size} style={{ "--c": `var(--type-${type})` } as CSSProperties}>
      {type}
    </span>
  );
}

export type Tone = "neutral" | "accent" | "good" | "bad" | "hi";

export interface PillProps {
  children: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
  style?: CSSProperties;
}

/** Small static label: "x3 streak", "Round 4", "NEW!". */
export function Pill({ children, tone = "neutral", icon, size = "md", className, style }: PillProps) {
  return (
    <span className={cx(s.pill, className)} data-tone={tone} data-size={size} style={style}>
      {icon && <span className={s.icon}>{icon}</span>}
      <span>{children}</span>
    </span>
  );
}

export interface ChipProps {
  children: ReactNode;
  selected?: boolean;
  onPress?: () => void;
  icon?: ReactNode;
  /** Accent color when selected. Default the theme accent. */
  accent?: string;
  disabled?: boolean;
  sfx?: SfxId | null;
  className?: string;
}

/** Toggleable pill button for filters and options (64 px tall touch target). */
export function Chip({ children, selected = false, onPress, icon, accent, disabled, sfx = "select", className }: ChipProps) {
  return (
    <button
      type="button"
      className={cx(s.chip, className)}
      aria-pressed={selected}
      disabled={disabled}
      style={accent ? ({ "--chip": accent } as CSSProperties) : undefined}
      onClick={() => {
        if (sfx) audio.sfx(sfx);
        haptic("select");
        onPress?.();
      }}
    >
      {icon && <span className={s.icon}>{icon}</span>}
      <span>{children}</span>
    </button>
  );
}
