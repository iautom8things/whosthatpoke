import { describe, expect, it } from "vitest";
import { buildManifest } from "../manifest.mjs";
import {
  alignWords,
  chooseCuts,
  expectedWords,
  fillPacks,
  respellingProblems,
  respellToInput,
  sentenceCase,
  shuffle,
  slug,
  spoken,
  syllables,
  words,
} from "./text.mjs";

describe("prize keys", () => {
  it("match the keys the runtime builds from the default tiers", () => {
    const key = (title, reward) => `prize.${slug(spoken(`${title}! ${reward}`))}`;
    expect(key("Rookie Trainer", "Grab a treat!")).toBe("prize.rookie-trainer-grab-a-treat");
    expect(key("Ace Trainer", "BIG candy!")).toBe("prize.ace-trainer-big-candy");
    expect(key("Gym Leader", "BIG candy + bragging rights!")).toBe("prize.gym-leader-big-candy-and-bragging-rights");
    expect(key("Pokémon Master", "Pick ANY candy you want!")).toBe("prize.pokemon-master-pick-any-candy-you-want");
  });

  it("match the runtime for a host-typed emoji between letters (its variation selector stays a separator)", () => {
    expect(`prize.${slug(spoken("Candy❤️Queen! BIG❤️candy"))}`).toBe("prize.candy-queen-big-candy");
  });

  it("cut a long slug to 50 characters plus a hash, as the runtime contract's test vector says", () => {
    expect(slug("Super Duper Spooky Champion! Two full-size candy bars and a glow stick!")).toBe(
      "super-duper-spooky-champion-two-full-size-candy-ba-07409504",
    );
  });

  it("sentence-case the spoken text", () => {
    expect(sentenceCase(spoken("Ace Trainer! BIG candy!"))).toBe("Ace Trainer! Big candy!");
  });
});

describe("respellings", () => {
  it("drop stress caps and capitalize each word like a name", () => {
    expect(respellToInput("ray-KWAY-zuh")).toBe("Ray-kway-zuh");
    expect(respellToInput("MIS-ter MIME")).toBe("Mis-ter Mime");
  });

  it("pass the forms that tested well", () => {
    for (const ok of ["Gare-uh-dose", "Ray-kway-zuh", "Mimmy-cue", "Poh-kay-mon", "Mis-ter Mime", "Tah-poo Koh-koh"]) {
      expect(respellingProblems(ok)).toEqual([]);
    }
  });

  it("reject stress caps, letter-name chunks, IPA and punctuation", () => {
    expect(respellingProblems("GARE-uh-dose")).not.toEqual([]);
    expect(respellingProblems("Jee-ar-uh-doss").join()).toMatch(/"jee".*"ar"/);
    expect(respellingProblems("Es-pee-on")).not.toEqual([]);
    expect(respellingProblems("Ɡɛrədoʊs")).not.toEqual([]);
    expect(respellingProblems("Type: Null")).not.toEqual([]);
    expect(respellingProblems("Drag-uhpult")).not.toEqual([]);
    expect(respellingProblems("Pohh-kay-mon")).not.toEqual([]);
  });
});

describe("QA word match", () => {
  const names = { 130: "Gyarados", 25: "Pikachu" };

  it("never fails a take on how a name was transcribed", () => {
    const r = alignWords(expectedWords("It’s {130}!", names), words("It's Gerados!"));
    expect(r.edits).toEqual([]);
    expect(r.slots[130]).toBe("gerados");
  });

  it("keeps a multi-word name together, in order", () => {
    const r = alignWords(expectedWords("It’s {130}!", names), words("It's Mimi Q!"));
    expect(r.slots[130]).toBe("mimi q");
  });

  it("joins a possessive to the name and lets a glue word fuse into it", () => {
    expect(alignWords(expectedWords("It must be {130}'s doing.", names), words("It must be Gerados doing.")).edits).toEqual([]);
    expect(alignWords(expectedWords("It must be {130}'s doing.", names), words("It must be Gyarados's doing.")).edits).toEqual([]);
    const r = alignWords(expectedWords("or {130}?", names), words("Orgera does."));
    expect(r.edits).toEqual([]);
    expect(r.slots[130]).toBe("orgera does");
    expect(alignWords(expectedWords("or {130}?", names), words("Gyarados")).edits).toEqual(['missing "or"']);
  });

  it("flags literal words that are missing, swapped or added", () => {
    const exp = expectedWords("You got {25} out of ten!", names);
    expect(alignWords(exp, words("You got Pikachu out of 10!")).edits).toEqual([]);
    expect(alignWords(exp, words("You got Pikachu out of nine!")).edits).toEqual(['"ten" heard as "nine"']);
    expect(alignWords(expectedWords("Game over!", {}), words("Game over! Play again?")).edits).toHaveLength(2);
    expect(alignWords(expectedWords("Nice try!", {}), words("Nice")).edits).toEqual(['missing "try"']);
  });
});

describe("chooseCuts", () => {
  it("cuts at the comma pauses, not at a short gap inside a name", () => {
    const silences = [
      { start: 0, end: 0.05 },
      { start: 1.1, end: 1.4 },
      { start: 1.75, end: 1.84 }, // the hyphen in Ho-Oh
      { start: 2.3, end: 2.6 },
      { start: 3.4, end: 3.7 },
      { start: 4.6, end: 5.2 },
    ];
    expect(chooseCuts(silences, 5.2, [4, 3, 2, 4])).toEqual([1.25, 2.45, 3.55]);
  });

  it("gives up when there are fewer than three inner pauses", () => {
    expect(chooseCuts([{ start: 1, end: 1.3 }, { start: 2, end: 2.3 }], 4, [3, 2, 2, 3])).toBeNull();
  });
});

describe("helpers", () => {
  it("counts syllables well enough to predict a line's length", () => {
    expect(syllables("or Eevee?")).toBe(3);
    expect(syllables("It’s Mr. Mime!")).toBe(4);
    expect(syllables("Gare-uh-dose")).toBe(3);
  });


  it("shuffles deterministically", () => {
    const xs = Array.from({ length: 50 }, (_, i) => i);
    expect(shuffle(xs, 7)).toEqual(shuffle(xs, 7));
    expect(shuffle(xs, 7)).not.toEqual(xs);
    expect([...shuffle(xs, 7)].sort((a, b) => a - b)).toEqual(xs);
  });

  it("fills packs in order without splitting an item", () => {
    const packs = fillPacks([400, 400, 400, 1500, 100].map((bytes) => ({ bytes })), 1000);
    expect(packs.map((p) => p.items.map((i) => i.bytes))).toEqual([[400, 400], [400], [1500], [100]]);
  });
});

describe("buildManifest", () => {
  const catalog = [
    { dex: 25, name: "Pikachu", fact: "When Pikachu meet, they touch tails." },
    { dex: 778, name: "Mimikyu", fact: "Its rag looks like Pikachu’s face. No Pokémon is scarier." },
    { dex: 122, name: "Mr. Mime", fact: "Mr. Mime's walls are invisible." },
  ];
  const words = [{ id: "pokemon", text: "Pokémon" }];
  const tiers = [
    { minCorrect: 0, title: "Rookie Trainer", reward: "Grab a treat!" },
    { minCorrect: 10, title: "Pokémon Master", reward: "Pick ANY candy you want!" },
  ];
  const m = buildManifest({ catalog, words, tiers });
  const by = Object.fromEntries(m.map((e) => [e.key, e]));

  it("puts a slot wherever a species or table word is spoken", () => {
    expect(by["fact.778"].template).toBe("Its rag looks like {25}’s face. No {pokemon} is scarier.");
    expect(by["fact.778"].names).toEqual(["25", "pokemon"]);
    expect(by["fact.122"].template).toBe("{122}'s walls are invisible.");
    // The catchphrase keeps its spelling: its takes were picked by ear with it.
    expect(by["line.whos-that"].template).toBe("Who’s that Pokémon?");
    expect(by["score.named.12"].template).toBe("You named 12 {pokemon}!");
    expect(by["reveal.122"]).toMatchObject({ text: "It’s Mr. Mime!", template: "It’s {122}!" });
    expect(by["choice.last.25"]).toMatchObject({ text: "or Pikachu?", template: "or {25}?" });
  });

  it("covers every score line and the prize tiers", () => {
    expect(m.filter((e) => e.kind === "score")).toHaveLength(208);
    expect(by["prize.pokemon-master-pick-any-candy-you-want"]).toMatchObject({
      text: "Pokémon Master! Pick any candy you want!",
      template: "{pokemon} Master! Pick any candy you want!",
    });
    expect(by["prize.pokemon-master-pick-any-candy-you-want"].direction).toMatch(/Stress “any”/);
    expect(by["prize.custom"]).toBeDefined();
  });
});
