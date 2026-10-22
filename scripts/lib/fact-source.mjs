// Which game's Pokédex a catalog fact comes from: the release-order table of games, and matching a fact
// (data/flavor) to the English entries in data/pokeapi/flavor-sources.json.

/**
 * Every PokeAPI version, in release order (first release anywhere; same-day pairs in PokeAPI's order).
 * The order decides a fact's source: the earliest game that prints its entry.
 */
const RELEASES = [
  ["red-japan", "Pokémon Red (Japan)", "1996-02-27"],
  ["green-japan", "Pokémon Green", "1996-02-27"],
  ["red", "Pokémon Red", "1996-02-27"],
  ["blue", "Pokémon Blue", "1996-10-15"],
  ["blue-japan", "Pokémon Blue (Japan)", "1996-10-15"],
  ["yellow", "Pokémon Yellow", "1998-09-12"],
  ["gold", "Pokémon Gold", "1999-11-21"],
  ["silver", "Pokémon Silver", "1999-11-21"],
  ["crystal", "Pokémon Crystal", "2000-12-14"],
  ["ruby", "Pokémon Ruby", "2002-11-21"],
  ["sapphire", "Pokémon Sapphire", "2002-11-21"],
  ["colosseum", "Pokémon Colosseum", "2003-11-21"],
  ["firered", "Pokémon FireRed", "2004-01-29"],
  ["leafgreen", "Pokémon LeafGreen", "2004-01-29"],
  ["emerald", "Pokémon Emerald", "2004-09-16"],
  ["xd", "Pokémon XD: Gale of Darkness", "2005-08-04"],
  ["diamond", "Pokémon Diamond", "2006-09-28"],
  ["pearl", "Pokémon Pearl", "2006-09-28"],
  ["platinum", "Pokémon Platinum", "2008-09-13"],
  ["heartgold", "Pokémon HeartGold", "2009-09-12"],
  ["soulsilver", "Pokémon SoulSilver", "2009-09-12"],
  ["black", "Pokémon Black", "2010-09-18"],
  ["white", "Pokémon White", "2010-09-18"],
  ["black-2", "Pokémon Black 2", "2012-06-23"],
  ["white-2", "Pokémon White 2", "2012-06-23"],
  ["x", "Pokémon X", "2013-10-12"],
  ["y", "Pokémon Y", "2013-10-12"],
  ["omega-ruby", "Pokémon Omega Ruby", "2014-11-21"],
  ["alpha-sapphire", "Pokémon Alpha Sapphire", "2014-11-21"],
  ["sun", "Pokémon Sun", "2016-11-18"],
  ["moon", "Pokémon Moon", "2016-11-18"],
  ["ultra-sun", "Pokémon Ultra Sun", "2017-11-17"],
  ["ultra-moon", "Pokémon Ultra Moon", "2017-11-17"],
  ["lets-go-pikachu", "Pokémon Let’s Go, Pikachu!", "2018-11-16"],
  ["lets-go-eevee", "Pokémon Let’s Go, Eevee!", "2018-11-16"],
  ["sword", "Pokémon Sword", "2019-11-15"],
  ["shield", "Pokémon Shield", "2019-11-15"],
  ["the-isle-of-armor-sword", "Pokémon Sword: The Isle of Armor", "2020-06-17"],
  ["the-isle-of-armor-shield", "Pokémon Shield: The Isle of Armor", "2020-06-17"],
  ["the-crown-tundra-sword", "Pokémon Sword: The Crown Tundra", "2020-10-22"],
  ["the-crown-tundra-shield", "Pokémon Shield: The Crown Tundra", "2020-10-22"],
  ["brilliant-diamond", "Pokémon Brilliant Diamond", "2021-11-19"],
  ["shining-pearl", "Pokémon Shining Pearl", "2021-11-19"],
  ["legends-arceus", "Pokémon Legends: Arceus", "2022-01-28"],
  ["scarlet", "Pokémon Scarlet", "2022-11-18"],
  ["violet", "Pokémon Violet", "2022-11-18"],
  ["the-teal-mask-scarlet", "Pokémon Scarlet: The Teal Mask", "2023-09-13"],
  ["the-teal-mask-violet", "Pokémon Violet: The Teal Mask", "2023-09-13"],
  ["the-indigo-disk-scarlet", "Pokémon Scarlet: The Indigo Disk", "2023-12-14"],
  ["the-indigo-disk-violet", "Pokémon Violet: The Indigo Disk", "2023-12-14"],
  ["legends-za", "Pokémon Legends: Z-A", "2025-10-16"],
  ["mega-dimension", "Pokémon Legends: Z-A Mega Dimension", "2025-12-10"],
  ["champions", "Pokémon Champions", "2026-01-01"],
];

/** PokeAPI version name → { name, released, rank } where rank is its place in release order. */
export const GAMES = Object.fromEntries(RELEASES.map(([id, name, released], rank) => [id, { name, released, rank }]));

export const releaseRank = (version) => GAMES[version]?.rank ?? Infinity;

/** Same as fetch-pokeapi.mjs: line breaks become spaces, soft hyphens go, curly quotes become straight. */
export function normalizeFlavor(text) {
  return text
    .replace(/[\n\f]/g, " ")
    .replace(/\u00ad/g, "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/ {2,}/g, " ")
    .trim();
}

/** A text's words: case and punctuation are typography, not edits ("POKéMON" in Red is "Pokémon" in Sword). */
const words = (text) => normalizeFlavor(text).toLowerCase().match(/[\p{L}\p{N}]+(?:'\p{L}+)?/gu) ?? [];

// Words every entry has, which say nothing about where a fact came from.
const FILLER = new Set(
  ("a an the and or but so of to in on at by for with from as is are was were be been being it its it's this that " +
    "these those they them their there here has have had do does did can could will would may might must should not no " +
    "than then when while if into onto out up down over under about very just also such which who what one some any all " +
    "each other pokémon").split(" "),
);

/** A crude stem, the same on both sides: "brewed" and "brewing" are both "brew". */
const stem = (word) => word.replace(/'s$/, "").replace(/ies$/, "y").replace(/(?:ing|ed|es|s|ly)$/, "");

const contentWords = (text) => new Set(words(text).filter((w) => !FILLER.has(w)).map(stem).filter((w) => w.length > 1));

/**
 * How close a fact must be to an entry to count as adapted from it: the share of the fact's content words the entry
 * has, and how many that is. Facts softened for small kids keep about a third of them ("What looks like its body is
 * actually hollow" from "What seems to be its body is actually hollow"); a fact made up from other lore keeps one or none.
 */
export const MIN_KEPT = 0.25;
export const MIN_SHARED = 2;

/**
 * The game whose Pokédex a fact comes from: { game, adapted }, or null when no entry is close enough.
 * An entry with the same words wins. Otherwise the entry that has the most of the fact's content words (then the
 * most of its own: the fact was trimmed from it), and the fact is marked adapted. Ties go to the earliest game.
 */
export function factSource(fact, entries) {
  if (!fact || !entries?.length) return null;
  const said = words(fact).join(" ");
  const same = entries.filter((e) => words(e.text).join(" ") === said);
  if (same.length) return { game: earliest(same), adapted: false };

  const factWords = contentWords(fact);
  if (!factWords.size) return null;
  const scored = entries.map((e) => {
    const entryWords = contentWords(e.text);
    const shared = [...factWords].filter((w) => entryWords.has(w)).length;
    return { e, shared, kept: shared / factWords.size, cover: shared / (entryWords.size || 1) };
  });
  const top = scored.reduce((a, b) => ((b.kept - a.kept || b.cover - a.cover) > 0 ? b : a));
  if (top.kept < MIN_KEPT || top.shared < MIN_SHARED) return null;
  const tied = scored.filter((s) => s.kept === top.kept && s.cover === top.cover).map((s) => s.e);
  return { game: earliest(tied), adapted: true };
}

function earliest(entries) {
  const version = entries.flatMap((e) => e.versions).sort((a, b) => releaseRank(a) - releaseRank(b))[0];
  const game = GAMES[version];
  if (!game) throw new Error(`unknown PokeAPI version ${version}: add it to RELEASES in scripts/lib/fact-source.mjs`);
  return game.name;
}
