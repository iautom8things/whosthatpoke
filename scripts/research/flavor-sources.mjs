// Builds data/pokeapi/flavor-sources.json: every English Pokédex entry per species and the games that print it,
// so build-catalog.mjs can footnote each fact with the game it comes from.
// Usage: node scripts/research/flavor-sources.mjs
// Env:   POKEAPI_CACHE_DIR  raw response cache (default: <tmpdir>/whosthatpoke-pokeapi, shared with fetch-pokeapi.mjs)
// Output: { "<dex>": [{ text, versions: [PokeAPI version names, release order] }] }, entries by first release.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GAMES, normalizeFlavor, releaseRank } from "../lib/fact-source.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const outPath = join(root, "data/pokeapi/flavor-sources.json");
const CACHE_DIR = process.env.POKEAPI_CACHE_DIR ?? join(os.tmpdir(), "whosthatpoke-pokeapi");
const API = "https://pokeapi.co/api/v2";
const USER_AGENT = "whosthatpoke-research/0.1 (+https://iautom8things.github.io/whosthatpoke/)";
const CONCURRENCY = 4;
const MAX_ATTEMPTS = 6;
const SPECIES = 1025;

class HttpError extends Error {
  constructor(url, status) {
    super(`HTTP ${status} for ${url}`);
    this.status = status;
  }
}

// Same file names as fetch-pokeapi.mjs, so the two scripts share one cache.
const cacheFile = (url) => join(CACHE_DIR, url.replace(/^https?:\/\//, "").replace(/[^A-Za-z0-9._-]+/g, "_") + ".json");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const counts = { network: 0, cached: 0 };

async function getJson(url) {
  const file = cacheFile(url);
  try {
    const json = JSON.parse(await readFile(file, "utf8"));
    counts.cached++;
    return json;
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
      if (!res.ok) throw new HttpError(url, res.status);
      const text = await res.text();
      const json = JSON.parse(text);
      counts.network++;
      await writeFile(file, text);
      return json;
    } catch (err) {
      if (err instanceof HttpError && err.status < 500 && err.status !== 429) throw err;
      lastError = err;
      if (attempt < MAX_ATTEMPTS) await sleep(500 * 2 ** attempt + Math.random() * 250);
    }
  }
  throw lastError;
}

async function mapPool(items, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

/** One species' English entries: identical texts merged, their versions in release order. */
function entriesOf(raw, unknown) {
  const byText = new Map();
  for (const e of raw.flavor_text_entries) {
    if (e.language.name !== "en") continue;
    const text = normalizeFlavor(e.flavor_text);
    const version = e.version.name;
    if (!text) continue;
    if (!GAMES[version]) unknown.add(version);
    const versions = byText.get(text) ?? [];
    if (!versions.includes(version)) versions.push(version);
    byText.set(text, versions);
  }
  return [...byText]
    .map(([text, versions]) => ({ text, versions: versions.sort((a, b) => releaseRank(a) - releaseRank(b)) }))
    .sort((a, b) => releaseRank(a.versions[0]) - releaseRank(b.versions[0]));
}

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });
  const dexes = Array.from({ length: SPECIES }, (_, i) => i + 1);
  const failures = [];
  const raws = await mapPool(dexes, async (dex) => {
    try {
      const raw = await getJson(`${API}/pokemon-species/${dex}/`);
      if (raw.id !== dex) throw new Error(`id mismatch: got ${raw.id}`);
      return raw;
    } catch (err) {
      failures.push(`${dex}: ${err.message}`);
      return null;
    }
  });

  const unknown = new Set();
  const out = {};
  raws.forEach((raw, i) => {
    if (raw) out[dexes[i]] = entriesOf(raw, unknown);
  });
  const empty = Object.entries(out).filter(([, entries]) => entries.length === 0).map(([dex]) => dex);

  // One entry per line, so a refetch shows up as a readable diff.
  const species = Object.entries(out).map(([dex, entries]) => ` "${dex}": [\n${entries.map((e) => `  ${JSON.stringify(e)}`).join(",\n")}\n ]`);
  await writeFile(outPath, `{\n${species.join(",\n")}\n}\n`);
  const total = Object.values(out).reduce((n, entries) => n + entries.length, 0);
  console.log(`species: ${Object.keys(out).length}, entries: ${total}`);
  console.log(`requests: ${counts.network} network, ${counts.cached} from cache`);
  if (empty.length) console.log(`no English entries: ${empty.join(", ")}`);
  if (unknown.size) console.log(`versions missing from GAMES in scripts/lib/fact-source.mjs: ${[...unknown].join(", ")}`);
  for (const f of failures) console.log(`failed ${f}`);
  console.log(`wrote ${outPath.slice(root.length + 1)}`);
  if (failures.length || unknown.size) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
