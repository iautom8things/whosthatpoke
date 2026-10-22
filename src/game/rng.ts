/** A seeded source of floats in [0, 1). Same seed, same sequence. */
export type Rng = () => number;

/** mulberry32: tiny, fast and good enough for shuffling a deck. */
export function mulberry32(seed: number): Rng {
  let a = (Number.isFinite(seed) ? Math.floor(seed) : 0) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An independent stream derived from a seed, so separate concerns don't shift each other's draws. */
export function forkRng(seed: number, stream: number): Rng {
  return mulberry32(Math.imul((Math.floor(seed) >>> 0) ^ 0x9e3779b9, stream * 2 + 1) ^ stream);
}

/** Integer in [0, n). */
export function randInt(rng: Rng, n: number): number {
  return Math.floor(rng() * n);
}

/** A shuffled copy (Fisher-Yates). */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function pick<T>(items: readonly T[], rng: Rng): T {
  if (items.length === 0) throw new Error("pick from an empty list");
  return items[randInt(rng, items.length)];
}

/** One item, chosen with probability proportional to its weight. Non-positive weights never win. */
export function weightedPick<T>(items: readonly T[], weight: (item: T, index: number) => number, rng: Rng): T {
  const weights = items.map((item, i) => Math.max(0, weight(item, i)));
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return pick(items, rng);
  let roll = rng() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll < 0 && weights[i] > 0) return items[i];
  }
  return items[weights.findLastIndex((w) => w > 0)];
}

/**
 * Up to `k` distinct items, weighted, without replacement (Efraimidis-Spirakis).
 * Items with a non-positive weight are never drawn. Order is draw order.
 */
export function weightedSample<T>(
  items: readonly T[],
  k: number,
  weight: (item: T, index: number) => number,
  rng: Rng,
): T[] {
  const keyed: { item: T; key: number }[] = [];
  items.forEach((item, i) => {
    const w = weight(item, i);
    if (w > 0) keyed.push({ item, key: Math.log(1 - rng()) / w });
  });
  return keyed
    .sort((a, b) => b.key - a.key)
    .slice(0, Math.max(0, k))
    .map((x) => x.item);
}
