// A dealt card never shows a "?" tile: art that fails to load gets the card swapped for a spare.
// Same check as the game's (src/ui/screens/game/useGameLoop.ts), kept here so the two screens stay apart.
import { artUrl } from "../../../data/catalog";
import type { Mon } from "../../../data/types";

/** How long the check waits. Slow art counts as fine: PokeArt keeps loading it. */
export const ART_CHECK_MS = 1500;
/** Spare cards tried before the card is played as it is. */
export const MAX_ART_SWAPS = 3;

/** False only when the art definitely failed (offline, missing file). */
export function artLoads(mon: Pick<Mon, "art">, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => resolve(true), timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      resolve(true);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(false);
    };
    img.src = artUrl(mon);
  });
}

export interface ArtDeal<M> {
  /** The answer on the card now. */
  current: () => M | undefined;
  loads: (mon: M) => Promise<boolean>;
  /** Puts a spare on the card. False when none is left or the card is no longer being dealt. */
  swap: () => boolean;
}

/** Checks the card's art and swaps the card until one loads. False when it gave up and the card plays as it is. */
export async function dealWithArt<M>({ current, loads, swap }: ArtDeal<M>, maxSwaps = MAX_ART_SWAPS): Promise<boolean> {
  for (let swaps = 0; ; swaps++) {
    const mon = current();
    if (mon === undefined || (await loads(mon))) return true;
    if (swaps >= maxSwaps || !swap()) return false;
  }
}
