import { useId, type CSSProperties } from "react";
import { cx } from "./cx";
import s from "./PokeBall.module.css";

export type BallKind = "poke" | "great" | "ultra" | "master";

export interface PokeBallProps {
  kind?: BallKind;
  /** px number or any CSS length. Default 1.4em. */
  size?: number | string;
  animate?: "none" | "wobble" | "spin" | "bounce";
  /** Greyed out, e.g. a lost life. */
  empty?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Accessible name. Omit for a decorative ball. */
  title?: string;
}

const INK = "#161616";
const TOP: Record<BallKind, string> = {
  poke: "#ee1515",
  great: "#2a6fdb",
  ultra: "#2b2b2b",
  master: "#7d33b8",
};

function Markings({ kind }: { kind: BallKind }) {
  switch (kind) {
    case "great":
      return (
        <>
          <ellipse cx="23" cy="29" rx="8.5" ry="19" transform="rotate(-32 23 29)" fill="#e8262b" />
          <ellipse cx="77" cy="29" rx="8.5" ry="19" transform="rotate(32 77 29)" fill="#e8262b" />
        </>
      );
    case "ultra":
      return (
        <>
          <path d="M5 46 C5 30 12 18 22 10 L33 16 C27 25 25 35 25 46 Z" fill="#ffd21f" />
          <path d="M95 46 C95 30 88 18 78 10 L67 16 C73 25 75 35 75 46 Z" fill="#ffd21f" />
        </>
      );
    case "master":
      return (
        <>
          <circle cx="22" cy="31" r="9.5" fill="#ec4d8c" />
          <circle cx="78" cy="31" r="9.5" fill="#ec4d8c" />
          <path d="M37 37V18l13 13 13-13v19" fill="none" stroke="#fff" strokeWidth="5.5" strokeLinejoin="round" strokeLinecap="round" />
        </>
      );
    default:
      return null;
  }
}

export const BALL_NAMES: Record<BallKind, string> = { poke: "Poké Ball", great: "Great Ball", ultra: "Ultra Ball", master: "Master Ball" };

/** Accurate Poké Ball family icon as inline SVG. */
export function PokeBall({ kind = "poke", size = "1.4em", animate = "none", empty, className, style, title }: PokeBallProps) {
  const id = useId().replace(/[^\w-]/g, "");
  const clip = `${id}-clip`;
  const shade = `${id}-shade`;
  const dim = Boolean(empty);
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={cx(s.ball, className)}
      data-animate={animate}
      data-empty={dim || undefined}
      style={style}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title && <title>{title}</title>}
      <defs>
        <clipPath id={clip}>
          <circle cx="50" cy="50" r="46" />
        </clipPath>
        <radialGradient id={shade} cx="38%" cy="30%" r="75%">
          <stop offset="55%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.28" />
        </radialGradient>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect width="100" height="100" fill="#f6f6f6" />
        <rect width="100" height="50" fill={dim ? "#8d8d99" : TOP[kind]} />
        {!dim && <Markings kind={kind} />}
        <rect width="100" height="100" fill={`url(#${shade})`} />
        <rect x="0" y="44.5" width="100" height="11" fill={INK} />
      </g>
      <circle cx="50" cy="50" r="46" fill="none" stroke={INK} strokeWidth="6" />
      <circle cx="50" cy="50" r="14.5" fill={INK} />
      <circle cx="50" cy="50" r="9.5" fill="#fff" />
      <circle cx="50" cy="50" r="5.5" fill="none" stroke="#c9c9c9" strokeWidth="1.6" />
      {!dim && <ellipse cx="31" cy="23" rx="10" ry="5.5" transform="rotate(-35 31 23)" fill="#fff" opacity="0.55" />}
    </svg>
  );
}
