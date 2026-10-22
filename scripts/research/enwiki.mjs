#!/usr/bin/env node
// English Wikipedia pageviews per species, last 12 full months.
//
// For each species, counts the plain name (only when it leads to a Pokémon
// page) and the "<Name> (Pokémon)" title (when it exists). Titles that do not
// exist count 0. Writes data/popularity/enwiki.json as { "<dex>": { views, titles } }.
//
// Usage: node scripts/research/enwiki.mjs

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SPECIES_PATH = join(ROOT, 'data', 'species-names.json');
const OUT_PATH = join(ROOT, 'data', 'popularity', 'enwiki.json');

const UA = 'whosthatpoke-research/0.1';
const API = 'https://en.wikipedia.org/w/api.php';
const PAGEVIEWS = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user';
const CONCURRENCY = 8;
const MAX_ATTEMPTS = 6;
const TITLES_PER_QUERY = 50;
const POKEMON_TITLE = /Pok[ée]mon/;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const backoff = (attempt) => 1000 * 2 ** (attempt - 1);
const chunk = (items, size) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));

// Last 12 full months, relative to the current UTC date, as YYYYMMDDHH bounds.
function lastFullMonths(count, now = new Date()) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - (count - 1), 1));
  const fmt = (d) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}0100`;
  return { start: fmt(start), end: fmt(end) };
}

async function getJson(url, { allow404 = false } = {}) {
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    } catch (err) {
      if (attempt >= MAX_ATTEMPTS) throw err;
      await sleep(backoff(attempt));
      continue;
    }
    if (res.ok) return res.json();
    if (res.status === 404 && allow404) return null;
    if (res.status === 429 || res.status >= 500) {
      if (attempt >= MAX_ATTEMPTS) throw new Error(`HTTP ${res.status} after ${attempt} attempts: ${url}`);
      const retryAfter = Number(res.headers.get('retry-after'));
      await sleep(retryAfter > 0 ? retryAfter * 1000 : backoff(attempt));
      continue;
    }
    throw new Error(`HTTP ${res.status}: ${url}`);
  }
}

async function mapPool(items, worker) {
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const i = next++;
      await worker(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, run));
}

function apiQuery(params) {
  const qs = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', ...params });
  return getJson(`${API}?${qs}`);
}

// Resolves titles through redirects. Returns Map<requested, { exists, final, disambig }>.
async function resolveTitles(titles, errors) {
  const result = new Map();
  await mapPool(chunk(titles, TITLES_PER_QUERY), async (batch) => {
    try {
      const data = await apiQuery({
        titles: batch.join('|'),
        redirects: '1',
        prop: 'pageprops',
        ppprop: 'disambiguation',
      });
      const normalized = new Map((data.query.normalized ?? []).map((r) => [r.from, r.to]));
      const redirects = new Map((data.query.redirects ?? []).map((r) => [r.from, r.to]));
      const pages = new Map(data.query.pages.map((p) => [p.title, p]));
      for (const requested of batch) {
        const normTitle = normalized.get(requested) ?? requested;
        const final = redirects.get(normTitle) ?? normTitle;
        const page = pages.get(final);
        result.set(requested, {
          exists: Boolean(page) && !page.missing && !page.invalid,
          final,
          disambig: 'disambiguation' in (page?.pageprops ?? {}),
        });
      }
    } catch (err) {
      errors.push({ stage: 'resolve', titles: batch, error: err.message });
    }
  });
  return result;
}

// True when any category of the page names a Pokémon category.
async function hasPokemonCategory(title) {
  let cont = null;
  do {
    const data = await apiQuery({ titles: title, prop: 'categories', cllimit: 'max', ...cont });
    const cats = data.query.pages[0]?.categories ?? [];
    if (cats.some((c) => POKEMON_TITLE.test(c.title))) return true;
    cont = data.continue ? { clcontinue: data.continue.clcontinue } : null;
  } while (cont);
  return false;
}

async function monthlyViews(title, range) {
  const article = encodeURIComponent(title.replace(/ /g, '_'));
  const data = await getJson(`${PAGEVIEWS}/${article}/monthly/${range.start}/${range.end}`, { allow404: true });
  return data ? data.items.reduce((sum, item) => sum + item.views, 0) : 0;
}

async function main() {
  const species = JSON.parse(await readFile(SPECIES_PATH, 'utf8'));
  if (species.length !== 1025) throw new Error(`expected 1025 species, got ${species.length}`);

  const range = lastFullMonths(12);
  const errors = [];

  // The data uses a curly apostrophe; Wikipedia titles use a straight one.
  const plainOf = (name) => name.replace(/’/g, "'");
  const plainTitles = species.map((s) => plainOf(s.name));
  const variantTitles = species.map((s) => `${plainOf(s.name)} (Pokémon)`);

  const plainRes = await resolveTitles(plainTitles, errors);
  const variantRes = await resolveTitles(variantTitles, errors);

  // Existing plain titles that do not lead to a Pokémon page need a category check.
  const needCategories = [
    ...new Set(
      plainTitles
        .map((t) => plainRes.get(t))
        .filter((r) => r && r.exists && !r.disambig && !POKEMON_TITLE.test(r.final))
        .map((r) => r.final),
    ),
  ];
  const categoryHit = new Map();
  await mapPool(needCategories, async (title) => {
    try {
      categoryHit.set(title, await hasPokemonCategory(title));
    } catch (err) {
      errors.push({ stage: 'categories', title, error: err.message });
    }
  });

  const plan = species.map((s, i) => {
    const plain = plainRes.get(plainTitles[i]);
    const variant = variantRes.get(variantTitles[i]);
    const titles = [];
    if (plain?.exists && !plain.disambig && (POKEMON_TITLE.test(plain.final) || categoryHit.get(plain.final))) {
      titles.push(plainTitles[i]);
    }
    if (variant?.exists) titles.push(variantTitles[i]);
    return { dex: s.dex, titles };
  });

  const uniqueTitles = [...new Set(plan.flatMap((p) => p.titles))];
  const views = new Map();
  await mapPool(uniqueTitles, async (title) => {
    try {
      views.set(title, await monthlyViews(title, range));
    } catch (err) {
      errors.push({ stage: 'pageviews', title, error: err.message });
    }
  });

  const out = {};
  for (const { dex, titles } of plan) {
    const total = titles.reduce((sum, t) => sum + (views.get(t) ?? 0), 0);
    out[dex] = { views: total, titles };
  }

  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, `${JSON.stringify(out, null, 2)}\n`);

  const ranked = Object.entries(out)
    .map(([dex, v]) => ({ dex: Number(dex), ...v, name: species[Number(dex) - 1]?.name }))
    .sort((a, b) => b.views - a.views || a.dex - b.dex);
  const summary = {
    range,
    written: OUT_PATH,
    species: plan.length,
    withNoTitles: plan.filter((p) => p.titles.length === 0).map((p) => p.dex),
    top25: ranked.slice(0, 25),
    bottom10: ranked.slice(-10).reverse(),
    errors,
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
