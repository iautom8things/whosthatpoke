import type { CSSProperties, HTMLAttributes, ReactNode, Ref } from "react";
import { audio, type SfxId } from "../../audio";
import { haptic } from "../../lib/haptic";
import { cx } from "./cx";
import s from "./Panel.module.css";

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  /** "glass" lets the backdrop show through; "solid" is opaque. Projector mode is always solid. */
  tone?: "glass" | "solid";
  padding?: "none" | "sm" | "md" | "lg";
  ref?: Ref<HTMLDivElement>;
}

/** Rounded surface for grouping content. Text inside uses --surface-ink. */
export function Panel({ tone = "glass", padding = "md", className, children, ...rest }: PanelProps) {
  return (
    <div {...rest} className={cx(s.panel, className)} data-tone={tone} data-pad={padding}>
      {children}
    </div>
  );
}

export interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  /** Top band and glow color, e.g. a category accent. */
  accent?: string;
  selected?: boolean;
  disabled?: boolean;
  /** Default "select". null = silent. */
  sfx?: SfxId | null;
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
  ref?: Ref<HTMLButtonElement>;
}

/** Big pressable tile (category, difficulty, mode). Same 3D press as Button. */
export function Card({ children, onPress, accent, selected, disabled, sfx = "select", className, style, ref, ...aria }: CardProps) {
  return (
    <button
      ref={ref}
      type="button"
      className={cx(s.card, className)}
      data-selected={selected || undefined}
      aria-pressed={selected === undefined ? undefined : selected}
      disabled={disabled}
      style={{ ...(accent && { "--card": accent }), ...style } as CSSProperties}
      onClick={() => {
        if (sfx) audio.sfx(sfx);
        haptic("select");
        onPress?.();
      }}
      {...aria}
    >
      {children}
    </button>
  );
}
