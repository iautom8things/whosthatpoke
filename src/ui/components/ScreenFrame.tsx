import type { CSSProperties, ReactNode } from "react";
import { useKeys } from "../../lib/useKeys";
import { useNav } from "../../state/nav";
import { cx } from "./cx";
import { BackButton } from "./IconButton";
import s from "./ScreenFrame.module.css";
import { SoundButton } from "./SoundButton";

export type FrameLayout = "center" | "split" | "stack" | "fill";

export interface ScreenFrameProps {
  children: ReactNode;
  /** Header title. A string renders as display text; pass a node for anything custom. */
  title?: ReactNode;
  /**
   * Back button + Escape key. true = useNav back(), a function = custom handler,
   * false/undefined = no back button.
   */
  back?: boolean | (() => void);
  /** Replaces the back button slot on the left. */
  headerLeft?: ReactNode;
  headerRight?: ReactNode;
  /**
   * The sound button, top right: in the header just inside headerRight, or alone in the corner when there is no
   * header. For the screens that play sound for the crowd, plus the title and Settings.
   */
  sound?: boolean;
  footer?: ReactNode;
  /**
   * center  one column, centered (menus, results)
   * split   first child = stage, second = side. Side by side in landscape, stacked in portrait.
   * stack   one column from the top, full width (lists, settings)
   * fill    no layout; the child gets the whole body
   */
  layout?: FrameLayout;
  className?: string;
  bodyClassName?: string;
  style?: CSSProperties;
}

/**
 * The layout every screen starts from: safe-area padding, a header row (back, title, actions),
 * a body that never scrolls the page, and an optional footer.
 */
export function ScreenFrame({ children, title, back, headerLeft, headerRight, sound, footer, layout = "center", className, bodyClassName, style }: ScreenFrameProps) {
  const onBack = back === true ? () => useNav.getState().back() : typeof back === "function" ? back : undefined;
  useKeys({ Escape: () => onBack?.() }, { enabled: Boolean(onBack) });

  const left = headerLeft ?? (onBack ? <BackButton onPress={onBack} /> : null);
  const hasHeader = Boolean(left || title || headerRight);

  return (
    <div className={cx(s.frame, className)} style={style} data-layout={layout}>
      {hasHeader ? (
        <header className={s.header}>
          <div className={s.left}>{left}</div>
          <div className={s.title}>{typeof title === "string" ? <h1 className={cx("wtp-display", s.titleText)}>{title}</h1> : title}</div>
          <div className={s.right}>
            {sound && <SoundButton />}
            {headerRight}
          </div>
        </header>
      ) : (
        sound && <SoundButton className={s.corner} />
      )}
      <main className={cx(s.body, bodyClassName)}>{children}</main>
      {footer && <footer className={s.footer}>{footer}</footer>}
    </div>
  );
}
