#!/usr/bin/env node
// Caches PokeAPI data for every species in data/species-names.json and writes
// data/pokeapi/{species,chains,flavor-all}.json.
//
// Usage: node scripts/fetch-pokeapi.mjs
// Env:   POKEAPI_CACHE_DIR  raw response cache (default: <tmpdir>/whosthatpoke-pokeapi)

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'data', 'pokeapi');
const CACHE_DIR = process.env.POKEAPI_CACHE_DIR ?? path.join(os.tmpdir(), 'whosthatpoke-pokeapi');
const API = 'https://pokeapi.co/api/v2';
const USER_AGENT = 'whosthatpoke-research/0.1';
const CONCURRENCY = 6;
const MAX_ATTEMPTS = 5;
const ROMAN_GENERATIONS = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9 };

const failures = [];
const counts = { network: 0, cached: 0 };

class HttpError extends Error {
  constructor(url, status) {
    super(`HTTP ${status} for ${url}`);
    this.status = status;
  }
}

const cacheFile = (url) =>
  path.join(CACHE_DIR, url.replace(/^https?:\/\//, '').replace(/[^A-Za-z0-9._-]+/g, '_') + '.json');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(url) {
  const file = cacheFile(url);
  try {
    const json = JSON.parse(await readFile(file, 'utf8'));
    counts.cached++;
    return json;
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
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

async function fetchOrRecord(url, label) {
  try {
    return await getJson(url);
  } catch (err) {
    failures.push({ label, url, error: err.message });
    return null;
  }
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

const idFromUrl = (url) => Number(url.match(/\/(\d+)\/?$/)[1]);

const english = (entries) => entries.find((e) => e.language.name === 'en');

// Flavor text: line breaks become spaces, soft hyphens are dropped, curly quotes become straight.
function normalizeFlavor(text) {
  return text
    .replace(/[\n\f]/g, ' ')
    .replace(/­/g, '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/ {2,}/g, ' ')
    .trim();
}

function walkChain(node, stage = 0, out = []) {
  out.push({ dex: idFromUrl(node.species.url), stage });
  for (const next of node.evolves_to) walkChain(next, stage + 1, out);
  return out;
}

function buildSpecies(entry, raw, pokemon) {
  const types = [...pokemon.types].sort((a, b) => a.slot - b.slot).map((t) => t.type.name);
  return {
    dex: entry.dex,
    slug: raw.name,
    name: english(raw.names)?.name,
    genus: english(raw.genera)?.genus,
    color: raw.color.name,
    shape: raw.shape?.name ?? null,
    habitat: raw.habitat?.name ?? null,
    isBaby: raw.is_baby,
    isLegendary: raw.is_legendary,
    isMythical: raw.is_mythical,
    generation: ROMAN_GENERATIONS[raw.generation.name.replace('generation-', '')],
    evolvesFrom: raw.evolves_from_species ? idFromUrl(raw.evolves_from_species.url) : null,
    chainId: idFromUrl(raw.evolution_chain.url),
    types,
    heightDm: pokemon.height,
    weightHg: pokemon.weight,
  };
}

function buildFlavor(raw) {
  const entries = raw.flavor_text_entries
    .filter((e) => e.language.name === 'en')
    .sort((a, b) => idFromUrl(b.version.url) - idFromUrl(a.version.url));
  const seen = new Set();
  const texts = [];
  for (const e of entries) {
    const text = normalizeFlavor(e.flavor_text);
    if (text && !seen.has(text)) {
      seen.add(text);
      texts.push(text);
    }
  }
  return texts;
}

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(OUT_DIR, { recursive: true });

  const registry = JSON.parse(await readFile(path.join(ROOT, 'data', 'species-names.json'), 'utf8'));
  const dexes = registry.map((s) => s.dex).sort((a, b) => a - b);
  const expected = Array.from({ length: 1025 }, (_, i) => i + 1);
  if (dexes.length !== 1025 || dexes.some((d, i) => d !== expected[i])) {
    throw new Error('data/species-names.json is not dex 1..1025');
  }

  // Species endpoints.
  const speciesRaw = await mapPool(registry, (s) =>
    fetchOrRecord(`${API}/pokemon-species/${s.dex}/`, `species ${s.dex}`),
  );
  speciesRaw.forEach((raw, i) => {
    if (raw && raw.id !== registry[i].dex) {
      failures.push({ label: `species ${registry[i].dex}`, error: `id mismatch: got ${raw.id}` });
    }
  });

  // Default variety /pokemon endpoints (types, height, weight).
  const pokemonUrls = speciesRaw.map((raw, i) => {
    if (!raw) return null;
    const def = raw.varieties.find((v) => v.is_default);
    if (!def) {
      failures.push({ label: `species ${registry[i].dex}`, error: 'no default variety' });
      return null;
    }
    return def.pokemon.url;
  });
  const pokemonRaw = await mapPool(pokemonUrls, (url) => (url ? fetchOrRecord(url, url) : null));

  // Evolution chains, one fetch per distinct chain id.
  const chainUrls = new Map();
  for (const raw of speciesRaw) {
    if (raw) chainUrls.set(idFromUrl(raw.evolution_chain.url), raw.evolution_chain.url);
  }
  const chainIds = [...chainUrls.keys()].sort((a, b) => a - b);
  const chainRaw = await mapPool(chainIds, (id) => fetchOrRecord(chainUrls.get(id), `chain ${id}`));

  const chains = {};
  chainIds.forEach((id, i) => {
    if (!chainRaw[i]) return;
    chains[id] = walkChain(chainRaw[i].chain)
      .sort((a, b) => a.stage - b.stage || a.dex - b.dex)
      .map((m) => m.dex);
  });

  // Build outputs.
  const species = [];
  const flavor = {};
  registry.forEach((entry, i) => {
    const raw = speciesRaw[i];
    const pokemon = pokemonRaw[i];
    if (!raw || !pokemon) return;
    species.push(buildSpecies(entry, raw, pokemon));
    flavor[entry.dex] = buildFlavor(raw);
  });
  species.sort((a, b) => a.dex - b.dex);

  await writeFile(path.join(OUT_DIR, 'species.json'), JSON.stringify(species, null, 2) + '\n');
  await writeFile(path.join(OUT_DIR, 'chains.json'), JSON.stringify(chains, null, 2) + '\n');
  await writeFile(path.join(OUT_DIR, 'flavor-all.json'), JSON.stringify(flavor, null, 2) + '\n');

  // Verification.
  const issues = [];
  if (species.length !== 1025) issues.push(`species count ${species.length}, expected 1025`);
  for (const s of species) {
    if (!s.name || !s.genus) issues.push(`dex ${s.dex}: missing English name or genus`);
    if (s.types.length < 1) issues.push(`dex ${s.dex}: no types`);
    if (s.generation === undefined) issues.push(`dex ${s.dex}: unknown generation`);
    if (s.shape === null) issues.push(`dex ${s.dex}: shape null`);
    if (flavor[s.dex].length === 0) issues.push(`dex ${s.dex}: no flavor text`);
  }
  const pikachuChain = chains[species.find((s) => s.dex === 25)?.chainId] ?? [];
  for (const dex of [172, 25, 26]) {
    if (!pikachuChain.includes(dex)) issues.push(`Pikachu chain missing ${dex}`);
  }
  const soft = Object.values(flavor).flat().filter((t) => /[­\n\f]/.test(t)).length;
  if (soft) issues.push(`${soft} flavor texts still contain control characters`);

  const flavorCount = Object.values(flavor).reduce((n, texts) => n + texts.length, 0);
  console.log(`species: ${species.length}`);
  console.log(`chains: ${Object.keys(chains).length} (of ${chainIds.length} referenced)`);
  console.log(`flavor texts: ${flavorCount} distinct across ${Object.keys(flavor).length} species`);
  console.log(`requests: ${counts.network} network, ${counts.cached} from cache`);
  console.log(`failures: ${failures.length}`);
  for (const f of failures) console.log(`  - ${f.label}${f.url ? ` (${f.url})` : ''}: ${f.error}`);
  console.log(`issues: ${issues.length}`);
  for (const i of issues) console.log(`  - ${i}`);
  console.log(`wrote ${path.relative(ROOT, OUT_DIR)}/{species,chains,flavor-all}.json`);

  if (failures.length || issues.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
