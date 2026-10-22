import { describe, expect, it } from "vitest";
import { forkRng, mulberry32, pick, shuffle, weightedPick, weightedSample } from "./rng";

describe("rng", () => {
  it("repeats for a seed and differs across seeds and streams", () => {
    const run = (r: () => number) => Array.from({ length: 5 }, r);
    expect(run(mulberry32(7))).toEqual(run(mulberry32(7)));
    expect(run(mulberry32(7))).not.toEqual(run(mulberry32(8)));
    expect(run(forkRng(7, 1))).not.toEqual(run(forkRng(7, 2)));
    expect(run(mulberry32(7)).every((x) => x >= 0 && x < 1)).toBe(true);
  });

  it("shuffle returns a permutation without touching the input", () => {
    const items = [1, 2, 3, 4, 5, 6];
    const out = shuffle(items, mulberry32(1));
    expect(items).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...out].sort()).toEqual(items);
  });

  it("weighted picks follow the weights and skip zero weights", () => {
    const rng = mulberry32(3);
    const counts = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 4000; i++) counts[weightedPick(["a", "b", "c"] as const, (x) => ({ a: 3, b: 1, c: 0 })[x], rng)]++;
    expect(counts.c).toBe(0);
    expect(counts.a / counts.b).toBeGreaterThan(2.5);
    expect(counts.a / counts.b).toBeLessThan(3.5);

    const sample = weightedSample([1, 2, 3, 4], 10, (x) => (x === 2 ? 0 : 1), rng);
    expect([...sample].sort()).toEqual([1, 3, 4]);
    expect(() => pick([], rng)).toThrow();
  });
});
