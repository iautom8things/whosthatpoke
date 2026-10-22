import { describe, expect, it } from "vitest";
import { factSource, GAMES } from "./fact-source.mjs";

// Froslass (478), trimmed from data/pokeapi/flavor-sources.json.
const froslass = [
  { text: "It freezes foes with an icy breath nearly -60 degrees F. What seems to be its body is actually hollow.", versions: ["diamond", "pearl"] },
  { text: "Legends in snowy regions say that a woman who was lost on an icy mountain was reborn as FROSLASS.", versions: ["heartgold"] },
  { text: "It freezes foes with an icy breath nearly -60 degrees Fahrenheit. What seems to be its body is actually hollow.", versions: ["x", "omega-ruby"] },
];

describe("factSource", () => {
  it("counts case, dashes and line-break hyphens as typography, and picks the earliest game", () => {
    const entries = [
      { text: "A strange seed was planted on its back at birth. The plant sprouts and grows with this Pokémon.", versions: ["x"] },
      { text: "A strange seed was planted on its back at birth. The plant sprouts and grows with this POKéMON.", versions: ["leafgreen", "red"] },
    ];
    expect(factSource("A strange seed was planted on its back at birth. The plant sprouts and grows with this Pokémon.", entries)).toEqual({
      game: "Pokémon Red",
      adapted: false,
    });
    expect(factSource("It won't miss prey, even those behind it.", [{ text: "It won't miss prey--even those behind it.", versions: ["diamond"] }])).toEqual({
      game: "Pokémon Diamond",
      adapted: false,
    });
    expect(factSource("It avoids attacks with dance-like steps.", [{ text: "It avoids attacks with dance- like steps.", versions: ["firered"] }])?.adapted).toBe(false);
  });

  it("marks a trimmed fact adapted and credits the entry it was cut from", () => {
    const entries = [
      { text: "It lurks in cities, pretending to be a lamp. Once it finds someone whose death is near, it will trail quietly after them.", versions: ["shield"] },
      { text: "It pretends to be a lamp in cities.", versions: ["diamond"] },
      { text: "It lurks in cities, pretending to be a lamp. Once it finds someone whose death is near, it will trail quietly after them.", versions: ["sword"] },
    ];
    expect(factSource("It lurks in cities, pretending to be a lamp.", entries)).toEqual({ game: "Pokémon Sword", adapted: true });
  });

  it("credits a fact softened for small kids to the entry it keeps the most of", () => {
    const fact = "On snowy nights it sneaks into towns to play icy pranks. What looks like its body is actually hollow.";
    expect(factSource(fact, froslass)).toEqual({ game: "Pokémon Diamond", adapted: true });
  });

  it("finds no source for a fact written from other lore", () => {
    const roaringMoon = [
      { text: "It is possible that this is the creature listed as Roaring Moon in an expedition journal that still holds many mysteries.", versions: ["scarlet"] },
      { text: "According to an article in a dubious magazine, this Pokémon has some connection to a phenomenon that occurs in a certain region.", versions: ["violet"] },
    ];
    expect(factSource("A mysterious Pokémon that looks like an ancient Salamence. It lives deep inside the great crater of Paldea.", roaringMoon)).toBeNull();
    expect(factSource("Its little flame glows to light the way through dark rooms.", [{ text: "Its flame is usually out.", versions: ["black-2"] }])).toBeNull();
    expect(factSource(undefined, froslass)).toBeNull();
    expect(factSource("Anything at all.", undefined)).toBeNull();
  });

  it("orders games by release, not by PokeAPI id", () => {
    const text = "It hides in tall grass.";
    expect(factSource(text, [{ text, versions: ["emerald", "firered"] }])?.game).toBe("Pokémon FireRed");
    expect(factSource(text, [{ text, versions: ["firered", "colosseum"] }])?.game).toBe("Pokémon Colosseum");
    const ranked = Object.values(GAMES).sort((a, b) => a.rank - b.rank);
    expect(ranked.map((g) => g.released)).toEqual([...ranked.map((g) => g.released)].sort());
  });

  it("refuses a version the release table does not know", () => {
    const text = "It hides in tall grass.";
    expect(() => factSource(text, [{ text, versions: ["pokemon-gold-2"] }])).toThrow(/RELEASES/);
  });
});
