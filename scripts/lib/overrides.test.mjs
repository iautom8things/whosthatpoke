import { describe, expect, it } from "vitest";
import { applyOverrides, TIERS, tierOfRank } from "./overrides.mjs";

// Base order is dex order, so dex N starts at rank N.
const order = Array.from({ length: 1025 }, (_, i) => ({ dex: i + 1, score: -i }));
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const into = (tier, dexes) => Object.fromEntries(dexes.map((dex) => [dex, { tier, reason: "test" }]));

const run = (overrides) => {
  const out = applyOverrides(order, overrides);
  const rankOf = new Map(out.map((s, i) => [s.dex, i + 1]));
  return { out, rank: (dex) => rankOf.get(dex), tier: (dex) => tierOfRank(rankOf.get(dex)) };
};

describe("applyOverrides", () => {
  it("lands every promotion into one tier in that tier, ordered by base score", () => {
    const promoted = [...range(121, 150), ...range(400, 409), 1000];
    const { rank, tier } = run(into(1, promoted));
    expect(promoted.filter((dex) => tier(dex) !== 1)).toEqual([]);
    expect(promoted.map(rank)).toEqual(range(80, 120));
    expect(range(80, 120).map((dex) => tier(dex))).toEqual(Array(41).fill(2));
  });

  it("lands demotions in their tier and rolls the next species up", () => {
    const { rank, tier } = run({ ...into(4, range(1, 10)), ...into(2, [11]) });
    expect(range(1, 10).map((dex) => tier(dex))).toEqual(Array(10).fill(4));
    expect(rank(1)).toBe(651);
    expect(rank(11)).toBe(121);
    expect(range(121, 131).map((dex) => tier(dex))).toEqual(Array(11).fill(1));
  });

  it("pins a species to its current tier when others leave", () => {
    const { tier } = run({ ...into(3, range(1, 5)), ...into(2, [121, 123]) });
    expect(tier(121)).toBe(2);
    expect(tier(123)).toBe(2);
    expect([122, 124, 125, 126, 127].map((dex) => tier(dex))).toEqual(Array(5).fill(1));
    expect(tier(128)).toBe(2);
  });

  it("puts rank overrides at exactly that rank, even when tier overrides crowd the tier", () => {
    const { rank, tier } = run({
      500: { rank: 3, reason: "test" },
      2: { rank: 1000, tier: 1, reason: "rank wins" },
      ...Object.fromEntries(range(700, 717).map((dex, i) => [dex, { rank: 103 + i, reason: "test" }])),
      ...into(1, range(200, 239)),
    });
    expect(rank(500)).toBe(3);
    expect(rank(2)).toBe(1000);
    expect(range(700, 717).map(rank)).toEqual(range(103, 120));
    expect(range(200, 239).filter((dex) => tier(dex) !== 1)).toEqual([]);
  });

  it("keeps every species once and every tier at its size", () => {
    const { out } = run({
      ...into(1, range(300, 340)),
      ...into(4, range(1, 30)),
      ...into(2, [125, 990]),
      50: { rank: 650, reason: "test" },
    });
    expect(Array.from(out, (s) => s?.dex).sort((a, b) => a - b)).toEqual(range(1, 1025));
    const sizes = TIERS.map((t) => out.filter((_, i) => tierOfRank(i + 1) === t.tier).length);
    expect(sizes).toEqual([120, 230, 300, 375]);
  });

  it("rejects an unknown dex and a missing reason", () => {
    expect(() => applyOverrides(order, { 2000: { tier: 1, reason: "test" } })).toThrow(/unknown dex 2000/);
    expect(() => applyOverrides(order, { 25: { tier: 1 } })).toThrow(/needs a reason/);
  });
});
