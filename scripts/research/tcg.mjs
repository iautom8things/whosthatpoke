// Counts English Pokémon TCG cards per National Pokédex number.
// Usage: node scripts/research/tcg.mjs --repo <path to PokemonTCG/pokemon-tcg-data clone>
// Writes data/popularity/tcg.json: { "<dex>": { "all": n, "since2020": n } } for dex 1..1025.

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const speciesPath = join(root, "data/species-names.json");
const outPath = join(root, "data/popularity/tcg.json");
const SINCE = "2020-01-01";

const repoArg = process.argv.indexOf("--repo");
if (repoArg === -1 || !process.argv[repoArg + 1]) {
  console.error("usage: node scripts/research/tcg.mjs --repo <pokemon-tcg-data clone>");
  process.exit(1);
}
const repo = resolve(process.argv[repoArg + 1]);

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
// sets/en.json dates look like "2020/01/01"; normalise to ISO for string comparison.
const isoDate = (d) => (d ?? "").replaceAll("/", "-");

const sets = new Map(readJson(join(repo, "sets/en.json")).map((s) => [s.id, isoDate(s.releaseDate)]));
const species = readJson(speciesPath);
const dexNumbers = species.map((s) => s.dex).sort((a, b) => a - b);

const counts = new Map(dexNumbers.map((d) => [d, { all: 0, since2020: 0 }]));
const stats = { cards: 0, cardsWithDex: 0, unknownSet: 0, unknownDex: new Set(), latestSetDate: "" };

const cardDir = join(repo, "cards/en");
for (const file of readdirSync(cardDir).filter((f) => f.endsWith(".json")).sort()) {
  const setId = file.replace(/\.json$/, "");
  const releaseDate = sets.get(setId);
  if (releaseDate === undefined) stats.unknownSet++;
  else if (releaseDate > stats.latestSetDate) stats.latestSetDate = releaseDate;
  const recent = releaseDate !== undefined && releaseDate >= SINCE;

  for (const card of readJson(join(cardDir, file))) {
    stats.cards++;
    const dexes = new Set(card.nationalPokedexNumbers ?? []);
    if (dexes.size === 0) continue;
    stats.cardsWithDex++;
    for (const dex of dexes) {
      const row = counts.get(dex);
      if (!row) {
        stats.unknownDex.add(dex);
        continue;
      }
      row.all++;
      if (recent) row.since2020++;
    }
  }
}

const out = {};
for (const dex of dexNumbers) out[dex] = counts.get(dex);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");

const ranked = dexNumbers
  .map((dex) => ({ dex, name: species[dex - 1]?.name, ...counts.get(dex) }))
  .sort((a, b) => b.all - a.all || a.dex - b.dex);
const zero = dexNumbers.filter((d) => counts.get(d).all === 0).length;

console.log(JSON.stringify({
  cards: stats.cards,
  cardsWithDex: stats.cardsWithDex,
  sets: sets.size,
  latestSetDate: stats.latestSetDate,
  cardsInUnknownSet: stats.unknownSet,
  dexOutsideSpeciesList: [...stats.unknownDex],
  dexWithZeroCards: zero,
}, null, 2));
console.log("top 25 by all:");
for (const r of ranked.slice(0, 25)) console.log(`${r.dex}\t${r.name}\tall=${r.all}\tsince2020=${r.since2020}`);
console.log(`wrote ${outPath}`);
