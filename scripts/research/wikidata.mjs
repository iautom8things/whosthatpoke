// Builds data/popularity/wikidata.json: Wikidata sitelink counts per National Pokédex number.
// Usage: node scripts/research/wikidata.mjs
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT = "whosthatpoke-research/0.1";
const SPECIES_CLASS = "Q3966183"; // Pokémon species

const QUERY = `
SELECT ?item ?dex ?sitelinks ?isSpecies WHERE {
  ?item wdt:P1685 ?dex .
  ?item wikibase:sitelinks ?sitelinks .
  BIND(EXISTS { ?item wdt:P31/wdt:P279* wd:${SPECIES_CLASS} } AS ?isSpecies)
}`;

async function runQuery(attempts = 5) {
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Accept: "application/sparql-results+json",
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": USER_AGENT,
        },
        body: new URLSearchParams({ query: QUERY }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()).results.bindings;
    } catch (err) {
      if (i === attempts) throw err;
      const wait = 2 ** i * 1000;
      console.error(`attempt ${i} failed (${err.message}), retrying in ${wait} ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

const term = (b, key) => b[key]?.value;
const qidOf = (uri) => uri.slice(uri.lastIndexOf("/") + 1);

const speciesNames = JSON.parse(await readFile(join(root, "data/species-names.json"), "utf8"));
const validDex = new Set(speciesNames.map((s) => s.dex));

const rows = await runQuery();
console.error(`SPARQL rows: ${rows.length}`);

// Per dex: prefer the species item, then the item with most sitelinks.
const best = new Map();
let skippedNoDex = 0;
for (const b of rows) {
  const dexRaw = term(b, "dex");
  const dex = Number.parseInt(dexRaw.replace(/^0+/, "") || "0", 10);
  if (!validDex.has(dex)) {
    skippedNoDex++;
    continue;
  }
  const candidate = {
    qid: qidOf(term(b, "item")),
    sitelinks: Number(term(b, "sitelinks")),
    isSpecies: term(b, "isSpecies") === "true",
  };
  const current = best.get(dex);
  const better =
    !current ||
    (candidate.isSpecies && !current.isSpecies) ||
    (candidate.isSpecies === current.isSpecies && candidate.sitelinks > current.sitelinks);
  if (better) best.set(dex, candidate);
}

const out = {};
for (const { dex } of [...speciesNames].sort((a, b) => a.dex - b.dex)) {
  const c = best.get(dex);
  out[dex] = c ? { sitelinks: c.sitelinks, qid: c.qid } : { sitelinks: 0, qid: null };
}

await mkdir(join(root, "data/popularity"), { recursive: true });
await writeFile(join(root, "data/popularity/wikidata.json"), JSON.stringify(out, null, 2) + "\n");

const withItem = best.size;
const withSpecies = [...best.values()].filter((c) => c.isSpecies).length;
console.error(`dex with Wikidata item: ${withItem}/${validDex.size}; with species class: ${withSpecies}; rows skipped (dex not in 1..1025): ${skippedNoDex}`);
