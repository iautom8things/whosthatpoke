import type { ButtonHTMLAttributes, MouseEvent, ReactNode, Ref } from "react";
import { audio, type SfxId } from "../../audio";
import { haptic } from "../../lib/haptic";
import { cx } from "./cx";
import s from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
export type ButtonSize = "md" | "lg" | "xl";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Icon before the label. Use the Icon* components or a <PokeBall/>. */
  icon?: ReactNode;
  /** Stretch to the container width. */
  block?: boolean;
  /** Sound on press. Default "tap". null = silent. */
  sfx?: SfxId | null;
  onPress?: (event: MouseEvent<HTMLButtonElement>) => void;
  ref?: Ref<HTMLButtonElement>;
}

/** Chunky 3D press button. Labels use the display font with a thick outline. */
export function Button({
  variant = "primary",
  size = "md",
  icon,
  block,
  sfx = "tap",
  onPress,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={cx(s.btn, className)}
      data-variant={variant}
      data-size={size}
      data-block={block || undefined}
      data-icon-only={!children || undefined}
      onClick={(e) => {
        if (sfx) audio.sfx(sfx);
        haptic("tap");
        onPress?.(e);
      }}
    >
      {icon && <span className={s.icon}>{icon}</span>}
      {children && <span className={s.label}>{children}</span>}
    </button>
  );
}
