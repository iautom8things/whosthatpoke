import type { ReactNode, Ref } from "react";
import { audio, type SfxId } from "../../audio";
import { haptic } from "../../lib/haptic";
import { useNav } from "../../state/nav";
import { cx } from "./cx";
import { IconBack } from "./icons";
import s from "./IconButton.module.css";

export interface IconButtonProps {
  icon: ReactNode;
  /** Accessible name; also shown as text when showLabel is set. */
  label: string;
  showLabel?: boolean;
  onPress?: () => void;
  variant?: "solid" | "ghost" | "primary";
  size?: "md" | "lg";
  disabled?: boolean;
  /** Default "tap". null = silent. */
  sfx?: SfxId | null;
  className?: string;
  ref?: Ref<HTMLButtonElement>;
}

/** Round chunky button for header actions (settings, sound, fullscreen). At least 64 px. */
export function IconButton({ icon, label, showLabel, onPress, variant = "solid", size = "md", disabled, sfx = "tap", className, ref }: IconButtonProps) {
  return (
    <button
      ref={ref}
      type="button"
      className={cx(s.btn, className)}
      data-variant={variant}
      data-size={size}
      data-labelled={showLabel || undefined}
      aria-label={showLabel ? undefined : label}
      disabled={disabled}
      onClick={() => {
        if (sfx) audio.sfx(sfx);
        haptic("tap");
        onPress?.();
      }}
    >
      <span className={s.icon}>{icon}</span>
      {showLabel && <span className={s.label}>{label}</span>}
    </button>
  );
}

export interface BackButtonProps {
  /** Default: useNav back(). */
  onPress?: () => void;
  label?: string;
  /** Show the word next to the arrow. Default true on roomy screens via CSS. */
  showLabel?: boolean;
  className?: string;
}

/** The standard back arrow for screen headers. Plays the "back" sound. */
export function BackButton({ onPress, label = "Back", showLabel = true, className }: BackButtonProps) {
  return (
    <IconButton
      icon={<IconBack />}
      label={label}
      showLabel={showLabel}
      sfx="back"
      className={cx(s.back, className)}
      onPress={onPress ?? (() => useNav.getState().back())}
    />
  );
}
