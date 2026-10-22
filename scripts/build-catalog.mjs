// Merges every data source into src/data/catalog.json, the one file the app reads.
// Only data/species-names.json is required; each enrichment is used when present.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { factSource } from "./lib/fact-source.mjs";

const root = new URL("..", import.meta.url).pathname;
const pkmnDir = process.env.PKMN_SVGS_DIR ?? join(root, "../pkmn_svgs");

const read = (rel) => {
  const path = rel.startsWith("/") ? rel : join(root, rel);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
};

const REGION_BY_GEN = ["", "kanto", "johto", "hoenn", "sinnoh", "unova", "kalos", "alola", "galar", "paldea"];
const TIER_CUTOFFS = [120, 350, 650];

const names = read("data/species-names.json");
if (!names) throw new Error("data/species-names.json is required");

const pkmnRows = read(join(pkmnDir, "data/pokemon.json")) ?? [];
const pkmnBySpecies = new Map();
for (const row of pkmnRows) {
  const prev = pkmnBySpecies.get(row.dex);
  if (!prev || row.name === row.species) pkmnBySpecies.set(row.dex, row);
}

const species = new Map((read("data/pokeapi/species.json") ?? []).map((s) => [s.dex, s]));
const popularity = read("data/popularity.json")?.species ?? null;
const pronunciations = read("data/pronunciations.json") ?? {};
const artIndex = read("data/art-index.json") ?? {};
const artMetrics = read("data/art-metrics.json") ?? {};
const groups = read("data/groups.json") ?? {};
const silhouettes = read("data/silhouettes.json") ?? { twins: [], blobs: [] };
const places = read("data/places.json") ?? {};
const flavorSources = read("data/pokeapi/flavor-sources.json");

const twinsOf = new Map();
for (const [a, b] of silhouettes.twins) {
  twinsOf.set(a, [...(twinsOf.get(a) ?? []), b]);
  twinsOf.set(b, [...(twinsOf.get(b) ?? []), a]);
}
const blobs = new Set(silhouettes.blobs.map((b) => b.dex));

const flavor = {};
const flavorDir = join(root, "data/flavor");
if (existsSync(flavorDir)) {
  for (const file of readdirSync(flavorDir).filter((f) => f.endsWith(".json"))) {
    Object.assign(flavor, JSON.parse(readFileSync(join(flavorDir, file), "utf8")));
  }
}

const tagSets = {
  starter: new Set([...(groups.starters?.lines ?? []), ...(groups.starters?.extras ?? [])]),
  spooky: new Set(groups.spooky ?? []),
  "ultra-beast": new Set(groups.ultraBeasts ?? []),
  paradox: new Set(groups.paradox ?? []),
  fossil: new Set(groups.fossils ?? []),
  baby: new Set(groups.babies ?? []),
  eeveelution: new Set(groups.eeveelutions ?? []),
  "pseudo-legendary": new Set(groups.pseudoLegendary ?? []),
};

// Facts go up on a projector at a kids' party. These never should.
const FACT_LINT = [
  [/--|— /, "ASCII dash or a space after a dash"],
  [/(^|[\s"])I\s/, "first person"],
  [/skull of|mother's skull|dead mother|life force|life energy|\bcursed\b|grudge|flesh|cut off|afterlife|still human|own head|devours/i, "too grim for little kids"],
  [/poison.*\bserves?\b|\bserves?\b.*poison/i, "poison treats on candy night"],
];
const factProblems = [];
for (const [dex, text] of Object.entries(flavor)) {
  for (const [pattern, why] of FACT_LINT) if (pattern.test(text)) factProblems.push(`${dex} (${why}): ${text}`);
}
if (factProblems.length) throw new Error(`fix these facts in data/flavor:\n${factProblems.join("\n")}`);

const tierFor = (rank) => (rank <= TIER_CUTOFFS[0] ? 1 : rank <= TIER_CUTOFFS[1] ? 2 : rank <= TIER_CUTOFFS[2] ? 3 : 4);

const artFor = (dex) => {
  const indexed = artIndex[dex]?.file;
  if (indexed && existsSync(join(root, "public", indexed))) return indexed;
  for (const ext of ["svg", "webp", "png"]) {
    if (existsSync(join(root, "public/pokemon", `${dex}.${ext}`))) return `pokemon/${dex}.${ext}`;
  }
  return null;
};

const skipped = [];
const catalog = [];
for (const entry of names) {
  const { dex } = entry;
  const art = artFor(dex);
  if (!art) {
    skipped.push(`${dex} ${entry.name}`);
    continue;
  }
  const sp = species.get(dex);
  const row = pkmnBySpecies.get(dex);
  const labels = new Set(row?.labels ?? []);
  const legendary = sp ? sp.isLegendary : labels.has("legendary");
  const mythical = sp ? sp.isMythical : labels.has("mythical");
  if (labels.has("pseudo-legendary")) tagSets["pseudo-legendary"].add(dex);
  if (sp?.isBaby) tagSets.baby.add(dex);

  const pop = popularity?.[dex];
  const rank = pop?.rank ?? dex;
  const tier = pop?.tier ?? tierFor(rank);
  const name = sp?.name ?? entry.name;
  const metrics = artMetrics[dex];

  catalog.push({
    dex,
    slug: entry.slug,
    name,
    say: pronunciations[dex] ?? name,
    gen: entry.generation,
    region: REGION_BY_GEN[entry.generation],
    types: sp?.types ?? row?.types ?? ["normal"],
    legendary,
    mythical,
    tags: Object.entries(tagSets).filter(([, set]) => set.has(dex)).map(([tag]) => tag),
    art,
    rank,
    tier,
    ...(sp?.genus && { genus: sp.genus }),
    ...(flavor[dex] && { fact: flavor[dex] }),
    // The game whose Pokédex the fact comes from, for the fact card's footnote. Null: no entry matches it.
    ...(flavor[dex] && flavorSources && { factSource: factSource(flavor[dex], flavorSources[dex]) }),
    ...(sp?.color && { color: sp.color }),
    ...(sp?.shape && { shape: sp.shape }),
    family: sp?.chainId ?? 10000 + dex,
    ...(metrics?.bbox && { bbox: metrics.bbox.map((n) => Math.round(n * 1000) / 1000) }),
    ...(twinsOf.has(dex) && { twins: twinsOf.get(dex).sort((a, b) => a - b) }),
    ...(blobs.has(dex) && { blob: true }),
    ...(places[dex] && { place: places[dex] }),
  });
}

writeFileSync(join(root, "src/data/catalog.json"), JSON.stringify(catalog));

const sources = {
  pokeapi: species.size > 0,
  popularity: Boolean(popularity),
  flavor: Object.keys(flavor).length,
  pronunciations: Object.keys(pronunciations).length,
  groups: Object.keys(groups).length > 0,
  artMetrics: Object.keys(artMetrics).length,
  twins: silhouettes.twins.length,
  blobs: blobs.size,
  places: Object.keys(places).filter((k) => k !== "notes").length,
  factSources: catalog.filter((m) => m.factSource).length,
};
console.log(`catalog: ${catalog.length} species, skipped ${skipped.length} without art`);
console.log("sources:", JSON.stringify(sources));
if (skipped.length) console.log("no art:", skipped.join(", "));
const unsourced = catalog.filter((m) => m.factSource === null).map((m) => `${m.dex} ${m.name}`);
if (unsourced.length) console.log("facts no Pokédex entry matches:", unsourced.join(", "));
