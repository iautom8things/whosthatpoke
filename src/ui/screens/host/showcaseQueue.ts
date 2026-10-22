// Endless, varied stream of Pokémon for the showcase loop: mostly famous ones, plus a spooky share
// because it's Halloween. Draws from the deck's answer bands, so it follows the live popularity data.
import type { Mon } from "../../../data/types";
import { answerBand } from "../../../game/deck";
import { mulberry32, shuffle, type Rng } from "../../../game/rng";

/** Share of draws from the spooky pool, then from the easy pool; the rest are medium. */
const SPOOKY_SHARE = 0.3;
const EASY_SHARE = 0.55;
/** A Pokémon never comes back within this many draws. */
const NO_REPEAT = 16;

export interface ShowcaseQueue {
  /** The Pokémon after the current one, for preloading. */
  peek(): Mon;
  next(): Mon;
}

export interface ShowcasePools {
  spooky: Mon[];
  easy: Mon[];
  medium: Mon[];
}

/** Disjoint pools: spooky first, then easy, then medium-only. */
export function showcasePools(): ShowcasePools {
  const taken = new Set<number>();
  const fresh = (list: readonly Mon[]) =>
    list.filter((m) => {
      if (taken.has(m.dex)) return false;
      taken.add(m.dex);
      return true;
    });
  const spooky = fresh([...answerBand("spooky", "easy"), ...answerBand("spooky", "medium")]);
  const easy = fresh(answerBand("all", "easy"));
  const medium = fresh(answerBand("all", "medium"));
  return { spooky, easy, medium };
}

/** A shuffled bag that refills itself when empty. */
function bag(items: readonly Mon[], rng: Rng): (avoid: ReadonlySet<number>) => Mon | null {
  let left: Mon[] = [];
  return (avoid) => {
    if (items.length === 0) return null;
    if (left.length === 0) left = shuffle(items, rng);
    const i = left.findIndex((m) => !avoid.has(m.dex));
    return left.splice(Math.max(0, i), 1)[0];
  };
}

export function createShowcaseQueue(seed = Date.now() % 2147483647, pools: ShowcasePools = showcasePools()): ShowcaseQueue {
  const rng = mulberry32(seed);
  const spooky = bag(pools.spooky, rng);
  const easy = bag(pools.easy, rng);
  const medium = bag(pools.medium, rng);
  const recent: number[] = [];

  const draw = (): Mon => {
    const avoid = new Set(recent);
    const roll = rng();
    const order = roll < SPOOKY_SHARE ? [spooky, easy, medium] : roll < SPOOKY_SHARE + EASY_SHARE ? [easy, medium, spooky] : [medium, easy, spooky];
    let mon: Mon | null = null;
    for (const from of order) {
      mon = from(avoid);
      if (mon && !avoid.has(mon.dex)) break;
    }
    if (!mon) throw new Error("The showcase has no Pokémon to show");
    recent.push(mon.dex);
    if (recent.length > NO_REPEAT) recent.shift();
    return mon;
  };

  let ahead = draw();
  return {
    peek: () => ahead,
    next: () => {
      const mon = ahead;
      ahead = draw();
      return mon;
    },
  };
}
