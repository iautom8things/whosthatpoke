import type { CSSProperties } from "react";
import { cx } from "./cx";
import s from "./Logo.module.css";

export interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  /** Letters bounce in one by one. Plays on mount. */
  animated?: boolean;
  /** Gentle idle bob after the entrance. */
  bob?: boolean;
  /** Render as the page heading (h1). Default true. */
  heading?: boolean;
  className?: string;
  style?: CSSProperties;
}

const LINE1 = "Who’s That";
const LINE2 = "Pokémon?";

function Letters({ text, offset }: { text: string; offset: number }) {
  return (
    <>
      {[...text].map((ch, i) =>
        ch === " " ? (
          <span key={i} className={s.space}>
            {" "}
          </span>
        ) : (
          <span key={i} className={s.letter} style={{ "--i": offset + i } as CSSProperties}>
            {ch}
          </span>
        ),
      )}
    </>
  );
}

/** The "Who's That Pokémon?" title lockup: yellow, thick blue outline, tilted. */
export function Logo({ size = "lg", animated = false, bob = false, heading = true, className, style }: LogoProps) {
  const Tag = heading ? "h1" : "div";
  return (
    <Tag
      className={cx(s.logo, className)}
      data-size={size}
      data-animated={animated || undefined}
      data-bob={bob || undefined}
      aria-label="Who’s That Pokémon?"
      style={style}
    >
      <span className={s.line1} aria-hidden="true">
        <Letters text={LINE1} offset={0} />
      </span>
      <span className={s.line2} aria-hidden="true">
        <Letters text={LINE2} offset={LINE1.length} />
      </span>
    </Tag>
  );
}
