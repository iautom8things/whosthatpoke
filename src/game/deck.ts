import type { Mon } from "../data/types";
import { categoryPool } from "./categories";
import { difficultyById, type DifficultyId } from "./difficulty";
import { forkRng, randInt, shuffle, weightedPick, type Rng } from "./rng";

export type Mode = "classic" | "survival" | "host";

export interface GameConfig {
  mode: Mode;
  categoryId: string;
  difficulty: DifficultyId;
  /** Questions in a classic or host game. Survival ignores it. */
  rounds: number;
  /** Seed for reproducible decks (demos, tests). */
  seed: number;
}

export interface Question {
  /** 0-based position in the game. */
  index: number;
  answer: Mon;
  /** Shuffled, includes the answer. Empty in host mode. */
  choices: Mon[];
}

export interface Deck {
  /** The next question, or null when the game has no more. */
  next(): Question | null;
  /** How many questions this deck can still produce (Infinity-safe for survival: a large number). */
  remaining(): number;
}

/** What a survival deck reports from remaining(). It never runs out. */
export const SURVIVAL_REMAINING = 1_000_000;

/** Hard mode skips the most famous Pokémon overall. */
const FAMOUS_OVERALL = 40;
/** A classic game picks each next answer from the few easiest left, so the ramp isn't mechanical. */
const CLASSIC_WINDOW = 3;
/** Survival walks its pool through a wider window, so every run feels different. */
const SURVIVAL_WINDOW = 10;
/** Survival in a category smaller than this borrows from the whole catalog. */
const MIN_SURVIVAL_POOL = 10;

// ---------------------------------------------------------------------------
// Answer bands: which part of a category each difficulty draws from.

const allPool = () => categoryPool("all");

let famousCache: Set<number> | null = null;
const famousOverall = () => (famousCache ??= new Set(allPool().slice(0, FAMOUS_OVERALL).map((m) => m.dex)));

const bandCache = new Map<string, readonly Mon[]>();

/** The part of a category's pool a difficulty draws answers from, most famous first. */
export function answerBand(categoryId: string, difficulty: DifficultyId, rounds = 10): readonly Mon[] {
  const key = `${categoryId}|${difficulty}|${rounds}`;
  let band = bandCache.get(key);
  if (!band) {
    band = bandFor(categoryPool(categoryId), difficulty, rounds);
    bandCache.set(key, band);
  }
  return band;
}

function bandFor(pool: readonly Mon[], difficulty: DifficultyId, rounds: number): Mon[] {
  const n = pool.length;
  const minSize = rounds + 6;
  const want = Math.min(n, minSize);
  const enough = (band: Mon[]) => band.length >= want;
  const famous = famousOverall();

  let band: Mon[];
  switch (difficulty) {
    case "easy": {
      const tier = pool.filter((m) => m.tier === 1);
      band = enough(tier) ? tier : pool.slice(0, Math.max(minSize, Math.ceil(n * 0.3)));
      break;
    }
    case "medium": {
      const tier = pool.filter((m) => m.tier <= 2);
      band = enough(tier) ? tier : pool.slice(0, Math.max(minSize, Math.ceil(n * 0.6)));
      break;
    }
    case "hard": {
      const tier = pool.filter((m) => (m.tier === 2 || m.tier === 3) && !famous.has(m.dex));
      band = enough(tier) ? tier : pool.slice(Math.floor(n / 3)).filter((m) => !famous.has(m.dex));
      break;
    }
    case "master": {
      const tier = pool.filter((m) => m.tier >= 3);
      band = enough(tier) ? tier : pool.slice(Math.floor(n / 2));
      break;
    }
  }
  const towardFamous = difficulty === "easy" || difficulty === "medium";
  return widen(pool, band, want, towardFamous);
}

/** Grows a band with its nearest neighbors in the pool until it holds `want`, alternating sides. */
function widen(pool: readonly Mon[], band: Mon[], want: number, towardFamous: boolean): Mon[] {
  if (band.length >= want) return band;
  const position = new Map(pool.map((m, i) => [m.dex, i]));
  const taken = new Set(band.map((m) => position.get(m.dex) ?? -1));
  const add = (i: number) => {
    if (i >= 0 && i < pool.length && !taken.has(i)) taken.add(i);
  };
  if (taken.size === 0) add(towardFamous ? 0 : pool.length - 1);
  let lo = Math.min(...taken);
  let hi = Math.max(...taken);
  for (let i = lo; i <= hi && taken.size < want; i++) add(i);
  let famousTurn = towardFamous;
  while (taken.size < want && (lo > 0 || hi < pool.length - 1)) {
    if ((famousTurn && lo > 0) || hi >= pool.length - 1) add(--lo);
    else add(++hi);
    famousTurn = !famousTurn;
  }
  return [...taken].sort((a, b) => a - b).map((i) => pool[i]);
}

/**
 * The opening questions of easy and medium games: picked from the band's most famous few.
 * When recent games used those up, look a little deeper before repeating one.
 */
function openers(band: readonly Mon[], k: number, ages: Ages, rng: Rng): Mon[] {
  let size = Math.min(24, Math.max(4, Math.ceil(band.length * 0.15)));
  for (let tries = 0; tries < 2 && size < band.length; tries++) {
    if (band.slice(0, size).filter((m) => !ages.has(m.dex)).length >= k) break;
    size *= 2;
  }
  return pickFresh(band.slice(0, size), k, ages, () => 1, rng).sort((a, b) => a.rank - b.rank);
}

/** Relative chance of each band member being picked as an answer. */
function answerWeight(band: readonly Mon[], difficulty: DifficultyId): (m: Mon) => number {
  const last = Math.max(1, band.length - 1);
  const position = new Map(band.map((m, i) => [m.dex, i / last]));
  switch (difficulty) {
    case "easy":
      return (m) => 2 - (position.get(m.dex) ?? 1); // lean toward the most famous
    case "medium":
      return (m) => 1 + (position.get(m.dex) ?? 0); // lean toward the tier-2 end
    default:
      return () => 1;
  }
}

// ---------------------------------------------------------------------------
// Picking answers.

type Ages = ReadonlyMap<number, number>;

/** dex -> how many answers ago it was shown (0 = newest). */
function agesOf(recent: readonly number[]): Map<number, number> {
  const ages = new Map<number, number>();
  recent.forEach((dex, i) => {
    if (!ages.has(dex)) ages.set(dex, i);
  });
  return ages;
}

/** Weighted picks that spread across evolution families. */
function sampleDiverse(cands: readonly Mon[], k: number, weight: (m: Mon) => number, rng: Rng): Mon[] {
  const out: Mon[] = [];
  const families = new Set<number>();
  let rest = cands.slice();
  while (out.length < k && rest.length > 0) {
    const m = weightedPick(rest, (c) => weight(c) * (families.has(c.family) ? 0.15 : 1), rng);
    out.push(m);
    families.add(m.family);
    rest = rest.filter((c) => c !== m);
  }
  return out;
}

/** `k` picks, never-recently-shown first, then the least recently shown. */
function pickFresh(cands: readonly Mon[], k: number, ages: Ages, weight: (m: Mon) => number, rng: Rng): Mon[] {
  const fresh = cands.filter((m) => !ages.has(m.dex));
  if (fresh.length >= k) return sampleDiverse(fresh, k, weight, rng);
  const stale = cands
    .filter((m) => ages.has(m.dex))
    .sort((a, b) => (ages.get(b.dex) ?? 0) - (ages.get(a.dex) ?? 0));
  return [...fresh, ...stale.slice(0, k - fresh.length)];
}

/**
 * Easier to harder by rank, with a little shuffle: each step picks among the `window` easiest
 * left, and steers away from the families shown in the last few steps.
 */
function ramp(mons: readonly Mon[], rng: Rng, window: number): Mon[] {
  const rest = mons.slice().sort((a, b) => a.rank - b.rank);
  const out: Mon[] = [];
  while (rest.length > 0) {
    const lately = new Set(out.slice(-3).map((m) => m.family));
    const head = rest.slice(0, window);
    const m = weightedPick(head, (c) => (lately.has(c.family) ? 0.05 : 1), rng);
    out.push(m);
    rest.splice(rest.indexOf(m), 1);
  }
  return out;
}

/** Fresh ones ramped, then the stale ones, least recently shown first. */
function freshFirst(mons: readonly Mon[], ages: Ages, rng: Rng): Mon[] {
  const fresh = mons.filter((m) => !ages.has(m.dex));
  const stale = mons
    .filter((m) => ages.has(m.dex))
    .sort((a, b) => (ages.get(b.dex) ?? 0) - (ages.get(a.dex) ?? 0));
  return [...ramp(fresh, rng, SURVIVAL_WINDOW), ...stale];
}

const hasOpeners = (difficulty: DifficultyId) => difficulty === "easy" || difficulty === "medium";

function classicAnswers(config: GameConfig, ages: Ages, rng: Rng): Mon[] {
  const rounds = roundsOf(config);
  const { difficulty } = config;
  const band = answerBand(config.categoryId, difficulty, rounds);
  const weight = answerWeight(band, difficulty);

  const first = hasOpeners(difficulty) ? openers(band, Math.min(2, rounds), ages, rng) : [];
  const opened = new Set(first.map((m) => m.dex));
  const rest = pickFresh(
    band.filter((m) => !opened.has(m.dex)),
    rounds - first.length,
    ages,
    weight,
    rng,
  );

  // A category smaller than the game borrows from the whole catalog at the same difficulty.
  const taken = new Set([...opened, ...rest.map((m) => m.dex)]);
  for (const filler of [answerBand("all", difficulty, rounds), allPool()]) {
    const short = rounds - taken.size;
    if (short <= 0) break;
    const extra = pickFresh(
      filler.filter((m) => !taken.has(m.dex)),
      short,
      ages,
      () => 1,
      rng,
    );
    for (const m of extra) {
      rest.push(m);
      taken.add(m.dex);
    }
  }
  return [...first, ...ramp(rest, rng, CLASSIC_WINDOW)];
}

const roundsOf = (config: GameConfig) => Math.max(1, Math.floor(config.rounds) || 10);

// ---------------------------------------------------------------------------
// Choices.

const nameKeys = new Map<number, string>();
/** Names compared loosely, so "Nidoran♀" and "Nidoran♂" never share a question. */
function nameKey(m: Mon): string {
  let key = nameKeys.get(m.dex);
  if (key == null) {
    key = m.name.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]/g, "");
    nameKeys.set(m.dex, key);
  }
  return key;
}

const known = (v: string | undefined, w: string | undefined) => v != null && w != null;

/** How alike two Pokémon look and feel. Family dominates, then shape + color, then types. */
export function similarity(a: Mon, b: Mon): number {
  return (a.family === b.family ? 100 : 0) + lookAlike(a, b);
}

function lookAlike(a: Mon, b: Mon): number {
  const sameShape = known(a.shape, b.shape) && a.shape === b.shape;
  const sameColor = known(a.color, b.color) && a.color === b.color;
  let score = (sameShape ? 12 : 0) + (sameColor ? 12 : 0) + (sameShape && sameColor ? 8 : 0);
  for (const t of a.types) if (b.types.includes(t)) score += 10;
  if (a.gen === b.gen) score += 4;
  return score;
}

/** Easy mode wants distractors that look nothing like the answer. */
function looksDifferent(a: Mon, b: Mon, strict: boolean): boolean {
  const shape = !known(a.shape, b.shape) || a.shape !== b.shape;
  const color = !known(a.color, b.color) || a.color !== b.color;
  return strict ? shape && color : shape || color;
}

interface Stage {
  from: readonly Mon[];
  /** Most picks this stage may contribute. */
  max?: number;
  /** Distractors from different families, none from the answer's. */
  distinctFamilies?: boolean;
  ok?: (m: Mon, picked: readonly Mon[]) => boolean;
  weight?: (m: Mon) => number;
}

/** Fills `n` distractors stage by stage; later stages relax the rules so it never comes up short. */
function fillDistractors(answer: Mon, n: number, stages: Stage[], rng: Rng): Mon[] {
  const out: Mon[] = [];
  const names = new Set([nameKey(answer)]);
  const families = new Set([answer.family]);
  for (const stage of stages) {
    let budget = Math.min(stage.max ?? n, n - out.length);
    while (budget > 0) {
      const cands = stage.from.filter(
        (m) =>
          m.dex !== answer.dex &&
          !names.has(nameKey(m)) &&
          !(stage.distinctFamilies && families.has(m.family)) &&
          (stage.ok?.(m, out) ?? true),
      );
      if (cands.length === 0) break;
      const m = weightedPick(cands, stage.weight ?? (() => 1), rng);
      out.push(m);
      names.add(nameKey(m));
      families.add(m.family);
      budget--;
    }
    if (out.length >= n) break;
  }
  return out;
}

let famousNamesCache: readonly Mon[] | null = null;
/** Names every kid knows: the catalog's tier 1, or its top slice if tiers are thin. */
function famousNames(): readonly Mon[] {
  if (!famousNamesCache) {
    const all = allPool();
    const tier1 = all.filter((m) => m.tier === 1);
    famousNamesCache = tier1.length >= 40 ? tier1 : all.slice(0, Math.max(40, Math.ceil(all.length * 0.12)));
  }
  return famousNamesCache;
}

/** The candidates most like the answer, best first; small noise varies ties between games. */
function closest(answer: Mon, score: (m: Mon) => number, limit: number, rng: Rng): Mon[] {
  return allPool()
    .filter((m) => m.dex !== answer.dex)
    .map((m) => ({ m, s: score(m) + rng() * 3 }))
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.m);
}

function distractors(answer: Mon, config: GameConfig, inCategory: ReadonlySet<number>, rng: Rng): Mon[] {
  const n = Math.max(0, difficultyById(config.difficulty).choices - 1);
  const all = allPool();
  const fallback: Stage[] = [{ from: all, distinctFamilies: true }, { from: all }];

  switch (config.difficulty) {
    case "easy": {
      const famous = famousNames();
      const fame = new Map(famous.map((m, i) => [m.dex, 2 - i / famous.length]));
      const weight = (m: Mon) => (fame.get(m.dex) ?? 1) * (inCategory.has(m.dex) ? 1.5 : 1);
      return fillDistractors(
        answer,
        n,
        [
          { from: famous, distinctFamilies: true, ok: (m) => looksDifferent(answer, m, true), weight },
          { from: famous, distinctFamilies: true, ok: (m) => looksDifferent(answer, m, false), weight },
          { from: famous, distinctFamilies: true, weight },
          ...fallback,
        ],
        rng,
      );
    }
    case "medium": {
      const local = answerBand(config.categoryId, "medium", 10);
      const global = answerBand("all", "medium", 10);
      const alike = (m: Mon) => lookAlike(answer, m);
      return fillDistractors(
        answer,
        n,
        [
          { from: local, max: 1, distinctFamilies: true, ok: (m) => alike(m) >= 12, weight: alike },
          { from: local, distinctFamilies: true },
          { from: global, distinctFamilies: true },
          ...fallback,
        ],
        rng,
      );
    }
    case "hard": {
      const score = (m: Mon) => lookAlike(answer, m) + (m.family === answer.family ? 15 : 0) + (inCategory.has(m.dex) ? 8 : 0);
      const near = closest(answer, score, 24, rng).filter((m) => lookAlike(answer, m) > 0);
      const oneRelative = (m: Mon, picked: readonly Mon[]) =>
        m.family !== answer.family || !picked.some((p) => p.family === answer.family);
      return fillDistractors(
        answer,
        n,
        [
          { from: near, ok: oneRelative, weight: score },
          { from: all, ok: (m) => m.types.some((t) => answer.types.includes(t)) },
          ...fallback,
        ],
        rng,
      );
    }
    case "master": {
      const score = (m: Mon) => similarity(answer, m) + (inCategory.has(m.dex) ? 15 : 0);
      const relatives = all.filter((m) => m.family === answer.family);
      const near = closest(answer, score, 6, rng);
      return fillDistractors(
        answer,
        n,
        [{ from: relatives, weight: score }, { from: near, weight: (m) => score(m) ** 2 }, ...fallback],
        rng,
      );
    }
  }
}

function choicesFor(answer: Mon, config: GameConfig, inCategory: ReadonlySet<number>, rng: Rng): Mon[] {
  if (config.mode === "host") return [];
  const choices = shuffle(distractors(answer, config, inCategory, rng), rng);
  choices.splice(randInt(rng, choices.length + 1), 0, answer);
  return choices;
}

// ---------------------------------------------------------------------------
// Decks.

/**
 * Builds a deck for one game.
 * `recent` lists dex numbers shown in earlier games tonight (newest first); avoid them when the pool allows.
 */
export function createDeck(config: GameConfig, recent: readonly number[] = []): Deck {
  const answerRng = forkRng(config.seed, 1);
  const choiceRng = forkRng(config.seed, 2);
  const inCategory = new Set(categoryPool(config.categoryId).map((m) => m.dex));
  const ages = agesOf(recent);
  const ask = (index: number, answer: Mon): Question => ({
    index,
    answer,
    choices: choicesFor(answer, config, inCategory, choiceRng),
  });

  if (config.mode === "survival") return survivalDeck(config, ages, answerRng, ask);

  const answers = classicAnswers(config, ages, answerRng);
  let index = 0;
  return {
    next: () => (index < answers.length ? ask(index, answers[index++]) : null),
    remaining: () => answers.length - index,
  };
}

/**
 * Survival never runs out: walk the difficulty's band easier to harder, then the rest of the pool
 * (harder ones first), then start a new lap that keeps the last few shown out of its opening.
 */
function survivalDeck(config: GameConfig, ages: Ages, rng: Rng, ask: (i: number, m: Mon) => Question): Deck {
  const { difficulty } = config;
  let pool = categoryPool(config.categoryId);
  if (pool.length < MIN_SURVIVAL_POOL) {
    const seen = new Set(pool.map((m) => m.dex));
    const borrowed = answerBand("all", difficulty, MIN_SURVIVAL_POOL).filter((m) => !seen.has(m.dex));
    pool = [...pool, ...borrowed].sort((a, b) => a.rank - b.rank);
  }
  const band = bandFor(pool, difficulty, MIN_SURVIVAL_POOL);

  const lap = (ages: Ages, opening: boolean): Mon[] => {
    const first = opening && hasOpeners(difficulty) ? openers(band, 2, ages, rng) : [];
    const used = new Set(first.map((m) => m.dex));
    const inBand = new Set(band.map((m) => m.dex));
    const bandRanks = band.map((m) => m.rank);
    const middle = bandRanks[Math.floor(bandRanks.length / 2)] ?? 0;
    const others = pool.filter((m) => !inBand.has(m.dex));
    return [
      ...first,
      ...freshFirst(band.filter((m) => !used.has(m.dex)), ages, rng),
      ...freshFirst(others.filter((m) => m.rank > middle), ages, rng),
      ...freshFirst(others.filter((m) => m.rank <= middle), ages, rng),
    ];
  };

  const shown: number[] = [];
  let queue = lap(ages, true);
  let index = 0;

  return {
    next: () => {
      if (queue.length === 0) {
        // Keep the last few answers out of the new lap's opening stretch.
        const window = Math.min(20, Math.floor(pool.length / 2));
        const blocked = new Set(shown.slice(-window));
        const order = lap(new Map(), false);
        queue = [...order.filter((m) => !blocked.has(m.dex)), ...order.filter((m) => blocked.has(m.dex))];
      }
      const answer = queue.shift();
      if (!answer) return null;
      shown.push(answer.dex);
      return ask(index++, answer);
    },
    remaining: () => SURVIVAL_REMAINING,
  };
}

// ---------------------------------------------------------------------------
// Helpers for the setup screens.

export interface CategoryInfo {
  /** Species in the category. */
  count: number;
  /** True when a game of `rounds` fits inside the category without borrowing. */
  playable: boolean;
  /** A few famous members from different families, for card art. */
  sample: Mon[];
}

function distinctFamilies(mons: readonly Mon[], count: number): Mon[] {
  const out: Mon[] = [];
  const families = new Set<number>();
  for (const m of mons) {
    if (out.length >= count) break;
    if (families.has(m.family)) continue;
    families.add(m.family);
    out.push(m);
  }
  for (const m of mons) {
    if (out.length >= count) break;
    if (!out.includes(m)) out.push(m);
  }
  return out;
}

export function categoryInfo(id: string, rounds = 10): CategoryInfo {
  const pool = categoryPool(id);
  return { count: pool.length, playable: pool.length >= rounds, sample: distinctFamilies(pool, 4) };
}

/** Where in its band each difficulty's preview looks, from 0 (most famous) to 1. */
const PREVIEW_SPAN: Record<Exclude<DifficultyId, "easy">, [number, number]> = {
  medium: [0, 0.8],
  hard: [0.2, 1],
  master: [0.4, 1],
};

/** A few example answers for a category at a difficulty. Stable: same input, same Pokémon. */
export function difficultyPreview(categoryId: string, difficulty: DifficultyId, count = 3): Mon[] {
  const band = answerBand(categoryId, difficulty, 10);
  if (difficulty === "easy") return distinctFamilies(band, count);
  const [lo, hi] = PREVIEW_SPAN[difficulty];
  const at = (i: number) => Math.floor(band.length * (lo + ((hi - lo) * (i + 0.5)) / count));
  const spread = Array.from({ length: Math.min(count, band.length) }, (_, i) => band[at(i)]);
  return distinctFamilies([...spread, ...band.slice(Math.floor(band.length * lo))], count);
}

/** Alias kept for the name in the UI brief. */
export const DIFFICULTY_PREVIEW = difficultyPreview;
