// What a host's swipe means, from the state of the card. Kept pure so the whole table has a test.
import type { SwipeDirection } from "../../../lib/useSwipe";

export type HostAction = { kind: "judge"; got: boolean } | { kind: "flip"; got: boolean } | { kind: "reveal" } | { kind: "next"; dir?: 1 | -1 };

/** A judge or reveal this soon after a deal was meant for the card before (a late "next", a double tap). */
export const DEAL_GUARD_MS = 700;

export const justDealt = (dealtAt: number, now: number) => now - dealtAt < DEAL_GUARD_MS;

/**
 * A swipe on the card. `verdict` is the call already made on it: true = got it, false = missed, null = still open.
 * Open: right = got it, left = missed, up = reveal. Judged: the way the verdict went (or up) is "next",
 * the other way changes the verdict.
 */
export function swipeAction(dir: SwipeDirection, verdict: boolean | null): HostAction | null {
  if (dir === "down") return null;
  if (verdict == null) return dir === "up" ? { kind: "reveal" } : { kind: "judge", got: dir === "right" };
  if (dir === "up") return { kind: "next" };
  const got = dir === "right";
  return got === verdict ? { kind: "next", dir: got ? 1 : -1 } : { kind: "flip", got };
}
