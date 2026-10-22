import { describe, expect, it } from "vitest";
import type { Mon } from "../data/types";
import { CATEGORIES, categoryPool } from "./categories";
import {
  answerBand,
  categoryInfo,
  createDeck,
  difficultyPreview,
  similarity,
  SURVIVAL_REMAINING,
  type Deck,
  type GameConfig,
  type Question,
} from "./deck";
import { DIFFICULTIES, type DifficultyId } from "./difficulty";

const DIFFS: DifficultyId[] = DIFFICULTIES.map((d) => d.id);
const config = (patch: Partial<GameConfig> = {}): GameConfig => ({
  mode: "classic",
  categoryId: "all",
  difficulty: "easy",
  rounds: 10,
  seed: 1,
  ...patch,
});

function drain(deck: Deck): Question[] {
  const out: Question[] = [];
  for (let q = deck.next(); q; q = deck.next()) out.push(q);
  return out;
}
const take = (deck: Deck, n: number) => Array.from({ length: n }, () => deck.next()!);
const play = (patch: Partial<GameConfig>, recent: number[] = []) => drain(createDeck(config(patch), recent));
const dexes = (mons: readonly Mon[]) => mons.map((m) => m.dex);
const nameKey = (m: Mon) => m.name.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]/g, "");
const seeds = (n: number) => Array.from({ length: n }, (_, i) => i * 7919 + 13);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const position = (categoryId: string) => new Map(categoryPool(categoryId).map((m, i) => [m.dex, i]));
const distractorsOf = (q: Question) => q.choices.filter((c) => c.dex !== q.answer.dex);

function expectWellFormed(q: Question, choices = 4) {
  expect(q.choices).toHaveLength(choices);
  expect(new Set(dexes(q.choices)).size).toBe(choices);
  expect(new Set(q.choices.map(nameKey)).size).toBe(choices);
  expect(dexes(q.choices)).toContain(q.answer.dex);
}

describe("classic decks", () => {
  const table = CATEGORIES.flatMap((c) => DIFFS.map((d) => [c.id, d] as const));

  it.each(table)("%s on %s: 10 unique answers, 4 unique choices each", (categoryId, difficulty) => {
    for (const seed of seeds(3)) {
      const deck = createDeck(config({ categoryId, difficulty, seed }));
      expect(deck.remaining()).toBe(10);
      const qs = drain(deck);
      expect(qs).toHaveLength(10);
      expect(deck.remaining()).toBe(0);
      expect(deck.next()).toBeNull();
      expect(new Set(qs.map((q) => q.answer.dex)).size).toBe(10);
      qs.forEach((q, i) => {
        expect(q.index).toBe(i);
        expectWellFormed(q);
      });
      const pool = categoryPool(categoryId);
      if (pool.length >= 10) {
        const inPool = new Set(dexes(pool));
        expect(qs.every((q) => inPool.has(q.answer.dex))).toBe(true);
      }
    }
  });

  it.each([5, 15])("plays %i rounds", (rounds) => {
    for (const difficulty of DIFFS) {
      const qs = play({ rounds, difficulty, categoryId: "legendary" });
      expect(qs).toHaveLength(rounds);
      expect(new Set(qs.map((q) => q.answer.dex)).size).toBe(rounds);
    }
  });

  it("never fails when the game is longer than the category", () => {
    const pool = categoryPool("mythical");
    const rounds = pool.length + 8;
    for (const difficulty of DIFFS) {
      const qs = play({ categoryId: "mythical", difficulty, rounds });
      expect(qs).toHaveLength(rounds);
      expect(new Set(qs.map((q) => q.answer.dex)).size).toBe(rounds);
      // Every member of the category gets used before borrowing.
      const answers = new Set(qs.map((q) => q.answer.dex));
      expect(pool.every((m) => answers.has(m.dex))).toBe(true);
      qs.forEach((q) => expectWellFormed(q));
    }
  });

  it("is deterministic for a seed and recent list", () => {
    const recent = dexes(categoryPool("all").slice(0, 30));
    for (const mode of ["classic", "host", "survival"] as const) {
      for (const difficulty of DIFFS) {
        const a = take(createDeck(config({ mode, difficulty, seed: 42 }), recent), 10);
        const b = take(createDeck(config({ mode, difficulty, seed: 42 }), recent), 10);
        expect(a.map((q) => [q.answer.dex, ...dexes(q.choices)])).toEqual(b.map((q) => [q.answer.dex, ...dexes(q.choices)]));
      }
    }
    const one = play({ seed: 1, difficulty: "medium" }).map((q) => q.answer.dex);
    const two = play({ seed: 2, difficulty: "medium" }).map((q) => q.answer.dex);
    expect(one).not.toEqual(two);
  });

  it("puts the answer in each of the 4 spots about equally often", { timeout: 30_000 }, () => {
    const counts = [0, 0, 0, 0];
    for (let seed = 1; seed <= 1000; seed++) {
      const difficulty = DIFFS[seed % DIFFS.length];
      for (const q of play({ seed, difficulty })) counts[q.choices.indexOf(q.answer)]++;
    }
    const total = counts.reduce((a, b) => a + b, 0);
    expect(total).toBe(10_000);
    for (const c of counts) {
      expect(c / total).toBeGreaterThan(0.225);
      expect(c / total).toBeLessThan(0.275);
    }
  });
});

describe("difficulty", () => {
  const answers = (difficulty: DifficultyId, n = 40) =>
    seeds(n).flatMap((seed) => play({ difficulty, seed }).map((q) => q.answer));

  it("easy draws mostly tier 1 and master mostly tiers 3-4 from All", () => {
    const easy = answers("easy");
    const master = answers("master");
    expect(easy.filter((m) => m.tier === 1).length / easy.length).toBeGreaterThan(0.8);
    expect(master.filter((m) => m.tier >= 3).length / master.length).toBeGreaterThan(0.8);
  });

  it("medium leans past tier 1, and hard skips the 40 most famous overall", () => {
    const medium = answers("medium");
    expect(medium.every((m) => m.tier <= 2)).toBe(true);
    expect(medium.filter((m) => m.tier === 2).length).toBeGreaterThan(medium.length / 2);
    const famous = new Set(dexes(categoryPool("all").slice(0, 40)));
    expect(answers("hard").some((m) => famous.has(m.dex))).toBe(false);
  });

  it("gets harder on average from easy to master", () => {
    const avg = DIFFS.map((d) => mean(answers(d, 20).map((m) => m.rank)));
    for (let i = 1; i < avg.length; i++) expect(avg[i]).toBeGreaterThan(avg[i - 1]);
  });

  it("opens easy and medium games with very gettable Pokémon", () => {
    const pos = position("all");
    const top = categoryPool("all").length * 0.05;
    for (const difficulty of ["easy", "medium"] as const) {
      for (const seed of seeds(30)) {
        const [first, second] = play({ difficulty, seed });
        expect(pos.get(first.answer.dex)!).toBeLessThan(top);
        expect(pos.get(second.answer.dex)!).toBeLessThan(top);
      }
    }
  });

  it("ramps from easier to harder within a game", () => {
    for (const difficulty of DIFFS) {
      const firstHalf: number[] = [];
      const secondHalf: number[] = [];
      for (const seed of seeds(30)) {
        play({ difficulty, seed }).forEach((q, i) => (i < 5 ? firstHalf : secondHalf).push(q.answer.rank));
      }
      expect(mean(firstHalf)).toBeLessThan(mean(secondHalf));
    }
  });

  it("works in a tiny category at every difficulty", () => {
    for (const difficulty of DIFFS) {
      for (const rounds of [5, 10, 15]) {
        for (const seed of seeds(5)) {
          const qs = play({ categoryId: "mythical", difficulty, rounds, seed });
          expect(qs).toHaveLength(rounds);
          expect(new Set(qs.map((q) => q.answer.dex)).size).toBe(rounds);
          if (categoryPool("mythical").length >= rounds) expect(qs.every((q) => q.answer.mythical)).toBe(true);
          qs.forEach((q) => expectWellFormed(q));
        }
      }
    }
  });
});

describe("distractors", () => {
  const questions = (difficulty: DifficultyId, categoryId = "all", n = 30) =>
    seeds(n).flatMap((seed) => play({ difficulty, categoryId, seed }));

  it("easy uses famous names from other families that look different", () => {
    const tier1 = categoryPool("all").filter((m) => m.tier === 1);
    for (const q of questions("easy")) {
      const others = distractorsOf(q);
      expect(new Set(others.map((m) => m.family)).size).toBe(others.length);
      for (const d of others) {
        expect(d.family).not.toBe(q.answer.family);
        if (tier1.length >= 40) expect(d.tier).toBe(1);
        const sameShape = d.shape != null && d.shape === q.answer.shape;
        const sameColor = d.color != null && d.color === q.answer.color;
        expect(sameShape && sameColor).toBe(false);
      }
    }
  });

  it("medium keeps the answer's family out and prefers its category", () => {
    const qs = questions("medium", "type-fire");
    const fire = qs.flatMap(distractorsOf);
    expect(fire.filter((m) => m.types.includes("fire")).length / fire.length).toBeGreaterThan(0.9);
    for (const q of [...qs, ...questions("medium")]) {
      expect(distractorsOf(q).some((d) => d.family === q.answer.family)).toBe(false);
    }
  });

  it("hard distractors share something with the answer", () => {
    for (const q of questions("hard")) {
      for (const d of distractorsOf(q)) {
        const shares =
          d.types.some((t) => q.answer.types.includes(t)) ||
          (d.shape != null && d.shape === q.answer.shape) ||
          (d.color != null && d.color === q.answer.color) ||
          d.gen === q.answer.gen;
        expect(shares).toBe(true);
      }
    }
  });

  it("gets more alike from easy to master, with family first on master", () => {
    const avg = DIFFS.map((d) => mean(questions(d).flatMap((q) => distractorsOf(q).map((x) => similarity(q.answer, x)))));
    for (let i = 1; i < avg.length; i++) expect(avg[i]).toBeGreaterThan(avg[i - 1]);
    // When the answer has relatives, master shows at least one of them.
    for (const q of questions("master")) {
      const relatives = categoryPool("all").filter((m) => m.family === q.answer.family && m.dex !== q.answer.dex);
      if (relatives.length > 0) expect(distractorsOf(q).some((d) => d.family === q.answer.family)).toBe(true);
    }
  });

  it("borrows from the whole catalog when the category is too small", () => {
    for (const difficulty of DIFFS) {
      for (const q of questions(difficulty, "mythical", 10)) expectWellFormed(q);
    }
  });
});

describe("fair questions", () => {
  const THEMES = ["spooky", "starters", "legendary", "mythical", "region-unova", "region-paldea", "type-rock", "type-ghost", "type-bug", "type-electric"];
  const firstTen = (mode: GameConfig["mode"], categoryId: string, difficulty: DifficultyId, n = 20) =>
    seeds(n).flatMap((seed) => take(createDeck(config({ mode, categoryId, difficulty, seed })), 10));
  const share = (qs: Question[], hit: (q: Question) => boolean) => qs.filter(hit).length / qs.length;

  it("picking the best-known name wins about as often as a guess", { timeout: 60_000 }, () => {
    const bestKnown = (q: Question) => q.choices.every((c) => c.rank >= q.answer.rank);
    const tells: string[] = [];
    for (const mode of ["classic", "survival"] as const) {
      for (const categoryId of ["all", ...THEMES]) {
        for (const difficulty of ["easy", "medium", "hard"] as const) {
          const rate = share(firstTen(mode, categoryId, difficulty), bestKnown);
          if (rate > 0.45) tells.push(`${mode} ${categoryId} ${difficulty}: ${rate}`);
        }
      }
    }
    expect(tells).toEqual([]);
  });

  it("in a theme, the answer is rarely the only on-theme name", { timeout: 60_000 }, () => {
    const tells: string[] = [];
    for (const categoryId of THEMES) {
      const inTheme = new Set(dexes(categoryPool(categoryId)));
      const onlyOne = (q: Question) => q.choices.filter((c) => inTheme.has(c.dex)).length === 1;
      for (const difficulty of DIFFS) {
        const rate = share(firstTen("classic", categoryId, difficulty), onlyOne);
        if (rate > 0.35) tells.push(`${categoryId} ${difficulty}: ${rate}`);
      }
    }
    expect(tells).toEqual([]);
  });

  it("never offers a silhouette twin of the answer", () => {
    const twins = categoryPool("all").filter((m) => m.twins?.length);
    expect(twins.map((m) => m.dex)).toEqual(expect.arrayContaining([100, 101]));
    for (const categoryId of ["all", "type-electric", "region-kanto"]) {
      for (const difficulty of DIFFS) {
        for (const q of firstTen("classic", categoryId, difficulty, 30)) {
          expect(q.choices.some((c) => q.answer.twins?.includes(c.dex))).toBe(false);
        }
      }
    }
  });

  it("keeps featureless silhouettes out of Poké Ball and Great Ball answers", () => {
    for (const c of CATEGORIES) {
      for (const difficulty of ["easy", "medium"] as const) {
        expect(answerBand(c.id, difficulty).filter((m) => m.blob).map((m) => m.name)).toEqual([]);
      }
    }
  });
});

describe("answer bands", () => {
  it("Poké Ball never reaches deeper than Great Ball, and Great Ball never reaches tier 4", () => {
    const deepest = (id: string, d: DifficultyId) => Math.max(...answerBand(id, d).map((m) => m.rank));
    const ids = CATEGORIES.map((c) => c.id);
    expect(ids.filter((id) => deepest(id, "easy") > deepest(id, "medium"))).toEqual([]);
    expect(ids.filter((id) => answerBand(id, "medium").some((m) => m.tier === 4))).toEqual([]);
  });

  it("Great Ball survival moves past the Poké Ball names early", () => {
    const tiers = (difficulty: DifficultyId) =>
      seeds(20).flatMap((seed) => take(createDeck(config({ mode: "survival", difficulty, seed })), 30).slice(2).map((q) => q.answer.rank));
    expect(mean(tiers("medium"))).toBeGreaterThan(2 * mean(tiers("easy")));
    expect(mean(tiers("hard"))).toBeGreaterThan(mean(tiers("medium")));
  });
});

describe("recent answers", () => {
  it("avoids recently shown Pokémon when the pool has enough fresh ones", () => {
    for (const difficulty of DIFFS) {
      const recent = seeds(3).flatMap((seed) => play({ difficulty, seed }).map((q) => q.answer.dex));
      const qs = play({ difficulty, seed: 999 }, recent);
      const shown = new Set(recent);
      expect(qs.filter((q) => shown.has(q.answer.dex))).toEqual([]);
    }
  });

  it("reuses the least recently shown first when it must", () => {
    const band = answerBand("mythical", "master", 10);
    expect(band.length).toBeGreaterThan(10);
    // Every band member is recent; the band's last ones are the oldest.
    const recent = dexes(band);
    const qs = play({ categoryId: "mythical", difficulty: "master" }, recent);
    expect(new Set(qs.map((q) => q.answer.dex))).toEqual(new Set(recent.slice(-10)));

    // Three fresh ones always make it in.
    const fresh = recent.slice(0, 3);
    const qs2 = play({ categoryId: "mythical", difficulty: "master" }, recent.slice(3));
    const picked = new Set(qs2.map((q) => q.answer.dex));
    expect(fresh.every((dex) => picked.has(dex))).toBe(true);
  });
});

describe("host mode", () => {
  it("has no choices and the same answers as classic", () => {
    const recent = dexes(categoryPool("all").slice(0, 20));
    for (const difficulty of DIFFS) {
      const host = play({ mode: "host", difficulty, seed: 5 }, recent);
      const classic = play({ mode: "classic", difficulty, seed: 5 }, recent);
      expect(host.every((q) => q.choices.length === 0)).toBe(true);
      expect(host.map((q) => q.answer.dex)).toEqual(classic.map((q) => q.answer.dex));
    }
  });
});

describe("survival", () => {
  it.each(["all", "mythical", "type-ice", "starters"])("%s keeps going past 200 questions", (categoryId) => {
    for (const difficulty of DIFFS) {
      const deck = createDeck(config({ mode: "survival", categoryId, difficulty, seed: 3 }));
      const qs = take(deck, 250);
      expect(deck.remaining()).toBe(SURVIVAL_REMAINING);
      qs.forEach((q, i) => {
        expect(q.index).toBe(i);
        expectWellFormed(q);
      });
      // No repeats close together; a full lap before any repeat in a big pool.
      const last = new Map<number, number>();
      const poolSize = Math.max(10, categoryPool(categoryId).length);
      qs.forEach((q, i) => {
        const prev = last.get(q.answer.dex);
        if (prev != null) expect(i - prev).toBeGreaterThanOrEqual(Math.min(poolSize - 1, 5));
        last.set(q.answer.dex, i);
      });
      if (categoryPool(categoryId).length >= 250) expect(last.size).toBe(250);
    }
  });

  it("starts easy and gets harder", () => {
    const early: number[] = [];
    const late: number[] = [];
    for (const seed of seeds(10)) {
      const qs = take(createDeck(config({ mode: "survival", difficulty: "easy", seed })), 150);
      qs.slice(0, 20).forEach((q) => early.push(q.answer.rank));
      qs.slice(130, 150).forEach((q) => late.push(q.answer.rank));
    }
    expect(mean(early)).toBeLessThan(mean(late));
  });

  it("avoids recent answers at the start of a run", () => {
    const recent = take(createDeck(config({ mode: "survival", seed: 1 })), 30).map((q) => q.answer.dex);
    const next = take(createDeck(config({ mode: "survival", seed: 2 }), recent), 30);
    const shown = new Set(recent);
    expect(next.filter((q) => shown.has(q.answer.dex))).toEqual([]);
  });
});

describe("setup helpers", () => {
  it("categoryInfo reports counts, playability and famous card art", () => {
    for (const c of CATEGORIES) {
      const pool = categoryPool(c.id);
      const info = categoryInfo(c.id);
      expect(info.count).toBe(pool.length);
      expect(info.playable).toBe(pool.length >= 10);
      expect(categoryInfo(c.id, pool.length + 1).playable).toBe(false);
      expect(info.sample.length).toBe(Math.min(4, pool.length));
      const inPool = new Set(dexes(pool));
      expect(info.sample.every((m) => inPool.has(m.dex))).toBe(true);
    }
  });

  it("difficultyPreview is stable, in the category, and harder for harder levels", () => {
    for (const c of CATEGORIES) {
      for (const d of DIFFS) {
        const a = difficultyPreview(c.id, d);
        expect(dexes(a)).toEqual(dexes(difficultyPreview(c.id, d)));
        expect(a.length).toBe(Math.min(3, categoryPool(c.id).length));
        const inPool = new Set(dexes(categoryPool(c.id)));
        expect(a.every((m) => inPool.has(m.dex))).toBe(true);
      }
    }
    const rank = (d: DifficultyId) => mean(difficultyPreview("all", d).map((m) => m.rank));
    expect(rank("easy")).toBeLessThan(rank("master"));
  });
});
