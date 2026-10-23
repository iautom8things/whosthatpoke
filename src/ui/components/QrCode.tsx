import { useMemo, type CSSProperties } from "react";
import { cx } from "./cx";
import { QUIET, qrShape } from "./qrShape";
import s from "./QrCode.module.css";

export interface QrCodeProps {
  /** The code, one string per row, "1" for a dark module (see src/data/playQr.ts). */
  rows: readonly string[];
  /** Accessible name. Omit when a caption next to it says what it opens. */
  title?: string;
  /** Module color. Print passes pure black, which takes one toner instead of three. */
  ink?: string;
  className?: string;
  style?: CSSProperties;
}

// Fixed colors, not theme tokens: a scanner needs dark modules on a light ground in every theme.
const INK = "#160a33";
const RED = "#ee1515";
const PAPER = "#ffffff";

/**
 * A QR code in the game's style: soft-cornered modules and a Poké Ball in the middle.
 * Includes the 4-module quiet zone on white, so it scans on any background.
 */
export function QrCode({ rows, title, ink = INK, className, style }: QrCodeProps) {
  const shape = useMemo(() => qrShape(rows), [rows]);
  const span = shape.size + QUIET * 2;
  const c = shape.hole.at + shape.hole.size / 2;
  return (
    <svg
      className={cx(s.qr, className)}
      style={style}
      viewBox={`${-QUIET} ${-QUIET} ${span} ${span}`}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <rect x={-QUIET} y={-QUIET} width={span} height={span} rx={QUIET * 0.6} fill={PAPER} />
      <path d={shape.modules} fill={ink} />
      {/* Square eyes: rounded ones stop OpenCV's detector from finding the code at all. */}
      {shape.eyes.map(([x, y]) => (
        <path key={`${x}-${y}`} d={`M${x} ${y}h7v7h-7zM${x + 1} ${y + 1}v5h5v-5zM${x + 2} ${y + 2}h3v3h-3z`} fill={ink} />
      ))}
      <g strokeWidth={0.36} stroke={ink}>
        <circle cx={c} cy={c} r={2.9} fill={PAPER} />
        <path d={`M${c - 2.9} ${c}A2.9 2.9 0 0 1 ${c + 2.9} ${c}Z`} fill={RED} />
        <path d={`M${c - 2.9} ${c}H${c + 2.9}`} strokeWidth={0.5} />
        <circle cx={c} cy={c} r={0.95} fill={PAPER} />
      </g>
    </svg>
  );
}
