// A dealt card never shows a "?" tile: art that fails to load gets the card swapped for a spare.
// The game does the same (src/ui/screens/game/useGameLoop.ts); both wait on PokeArt's loadArt, so the check and
// the fetch ahead share one download.
export { artLoads } from "../../components/PokeArt";

/**
 * How long the deal waits for the art. Only a failed download swaps the card: slow art counts as fine after this,
 * and PokeArt shows it when it lands. Cards fetched ahead are ready long before; this is for the first one.
 */
export const ART_CHECK_MS = 4000;
/** Spare cards tried before the card is played as it is. */
export const MAX_ART_SWAPS = 3;

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
