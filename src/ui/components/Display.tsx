import type { CSSProperties, ElementType, ReactNode } from "react";
import { cx } from "./cx";

export type DisplaySize = "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "hero";

export interface DisplayProps {
  children: ReactNode;
  size?: DisplaySize;
  /**
   * Fill color. Default --ink (white), or --surface-display inside a Panel, Card or Modal. Try
   * "var(--hi)" for the yellow highlight. A custom color always keeps the dark outline, even on a
   * classic surface where plain display text drops it.
   */
  color?: string;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
}

/** Cartoon title-card text: Luckiest Guy, thick outline, chunky drop shadow. */
export function Display({ children, size = "xl", color, as: Tag = "span", className, style }: DisplayProps) {
  return (
    <Tag
      className={cx("wtp-display", className)}
      style={{ fontSize: `var(--fs-${size})`, ...(color && { "--display-fill": color, "--display-stroke": "var(--outline)" }), ...style } as CSSProperties}
    >
      {children}
    </Tag>
  );
}
