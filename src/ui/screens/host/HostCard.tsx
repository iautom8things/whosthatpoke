import type { CSSProperties } from "react";
import type { Mon } from "../../../data/types";
import { Burst, PokeArt, PokeBall } from "../../components";
import s from "./HostCard.module.css";

/** hidden = silhouette, peek = shown before judging, judged = shown with a GOT IT! or MISSED stamp. */
export type CardFace = "hidden" | "peek" | "judged";
export type Verdict = "got" | "missed";

export interface HostCardProps {
  mon: Mon;
  face: CardFace;
  verdict: Verdict | null;
  /** Live drag offset from useSwipe. */
  dx: number;
  dy: number;
  dragging: boolean;
  /** Drag distance (px) where a swipe commits; stamps reach full strength there. */
  threshold: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** How strong a stamp gets before the drag would count. A full stamp means "let go and it happens". */
const FAINT = 0.35;

/**
 * The trading card the grown-up swipes. It follows the finger, tilts, and tints green or red
 * with GOT IT! / MISSED stamps; dragging up on a hidden card shows a REVEAL stamp.
 * A stamp stays faint until the drag is far enough to count, then pops to full.
 */
export function HostCard({ mon, face, verdict, dx, dy, dragging, threshold }: HostCardProps) {
  const judging = face !== "judged";
  const lean = verdict === "got" ? 1 : verdict === "missed" ? -1 : 0;
  const upward = face === "hidden" && dy < 0 && Math.abs(dy) > Math.abs(dx);
  const strength = (v: number) => (v >= threshold ? 1 : clamp(v / threshold, 0, 1) * FAINT);
  const armed =
    dragging && judging ? (dx >= threshold ? "got" : -dx >= threshold ? "miss" : upward && -dy >= threshold ? "peek" : undefined) : undefined;

  // Sideways follows the finger 1:1. Up follows only when it means something (peek); down barely moves.
  const y = dy < 0 ? (face === "hidden" ? dy : dy * 0.3) : dy * 0.2;
  const transform = dragging
    ? `translate3d(${dx}px, ${y}px, 0) rotate(${clamp(dx / 14, -22, 22)}deg)`
    : lean
      ? `translate3d(${lean * 2.5}%, 0, 0) rotate(${lean * 3}deg)`
      : undefined;

  const vars = {
    "--got": dragging && judging ? strength(dx) : verdict === "got" ? 1 : 0,
    "--miss": dragging && judging ? strength(-dx) : verdict === "missed" ? 1 : 0,
    "--peek": dragging && upward ? strength(-dy) : 0,
    "--chars": mon.name.length + 1,
    transform,
  } as CSSProperties;

  const shown = face !== "hidden";
  return (
    <div className={s.card} style={vars} data-dragging={dragging || undefined} data-armed={armed} data-face={face} data-verdict={verdict ?? undefined}>
      <div className={s.window}>
        <Burst intensity={1} className={s.burst} />
        <PokeArt mon={mon} revealed={shown} fill={0.9} />
      </div>
      <div className={s.plate}>
        {shown ? (
          <span className={`wtp-display ${s.name}`}>{mon.name}!</span>
        ) : (
          <span className={`wtp-display ${s.ask}`}>Who’s that Pokémon?</span>
        )}
      </div>
      <div className={s.tint} data-tone="got" aria-hidden="true" />
      <div className={s.tint} data-tone="miss" aria-hidden="true" />
      <span className={`wtp-display ${s.stamp}`} data-tone="got" aria-hidden="true">
        Got it!
      </span>
      <span className={`wtp-display ${s.stamp}`} data-tone="miss" aria-hidden="true">
        Missed
      </span>
      <span className={`wtp-display ${s.stamp}`} data-tone="peek" aria-hidden="true">
        Reveal!
      </span>
    </div>
  );
}

/** Face-down cards stacked behind the live one, so it reads as a deck that runs down. */
export function DeckBacks({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: Math.min(2, Math.max(0, count)) }, (_, i) => (
        <div key={i} className={s.back} data-depth={i + 1} aria-hidden="true">
          <PokeBall kind="poke" size="34%" />
        </div>
      ))}
    </>
  );
}
