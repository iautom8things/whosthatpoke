// Fetching ahead, round by round: a question's art and recorded lines start downloading a question or two before
// it is asked, so a slow connection never holds the game up. Nothing is saved up front; the service worker keeps
// each file as it arrives, so whatever was played once works offline afterwards. Decoding still happens per
// question (announcer.prepare); this only downloads.
import { announcer, lines, type Line } from "../../../audio";
import type { Mon } from "../../../data/types";
import type { Question } from "../../../game/deck";
import { loadArt } from "../../components/PokeArt";

/** Questions fetched past the one on screen. */
export const AHEAD = 2;

/** One thing to fetch ahead: a Pokémon's art and what the announcer says about it. */
export interface Upcoming {
  mon: Pick<Mon, "art">;
  lines: readonly (Line | undefined | false)[];
}

/** A classic or survival question: the name, its Pokédex entry, and on Poké Ball the four choices read out. */
export const questionAhead = (q: Question, easy: boolean): Upcoming => ({
  mon: q.answer,
  lines: [lines.reveal(q.answer), lines.fact(q.answer), easy && lines.choices(q.choices)],
});

/** A host card or a showcase slide: only the name is said. */
export const nameAhead = (mon: Mon): Upcoming => ({ mon, lines: [lines.reveal(mon)] });

let latest = 0;

/**
 * Downloads what these need, in order, one at a time: the art first, since the silhouette waits for it, then the
 * lines. A newer call takes over and this one stops where it is; the files they share download once.
 */
export async function fetchAhead(items: readonly Upcoming[]): Promise<void> {
  const run = ++latest;
  for (const item of items) {
    if (run !== latest) return;
    await loadArt(item.mon);
    if (run !== latest) return;
    await announcer.prefetch(item.lines);
  }
}
