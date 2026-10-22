#!/usr/bin/env node
// Builds data/popularity.json: one composite popularity rank per species, which
// sets the difficulty tier. Inputs live in data/popularity/. A missing or partial
// signal is skipped for the species it lacks, and that species' remaining weights
// are re-normalized, so the script can be re-run as more inputs land.
//
// Usage: node scripts/build-popularity.mjs

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { applyOverrides, TIERS, tierOfRank } from "./lib/overrides.mjs";

const root = new URL("..", import.meta.url).pathname;
const read = (rel) => {
  const path = join(root, rel);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
};

const WEIGHTS = { llm: 0.4, enwiki: 0.25, tcg: 0.15, wikidata: 0.1, polls: 0.1 };
const LENSES = ["kid2026", "parent", "merch"];

const names = read("data/species-names.json");
if (!names) throw new Error("data/species-names.json is required");
const DEX = names.map((s) => s.dex).sort((a, b) => a - b);
const regionOf = new Map(names.map((s) => [s.dex, s.region]));

const notes = [];
const generatedFrom = [];
const source = (path, signal, values) => {
  const species = values ? DEX.filter((d) => values.get(d) != null).length : 0;
  generatedFrom.push(values ? { path, signal, species } : { path, signal, species: 0, missing: true });
  return values;
};

const fromObject = (obj, pick) => {
  if (!obj) return null;
  const out = new Map();
  for (const dex of DEX) {
    const v = obj[dex] == null ? null : pick(obj[dex]);
    if (Number.isFinite(v)) out.set(dex, v);
  }
  return out;
};

// LLM lenses: raw 1-10 scores averaged across the lenses present for a species.
// Averaging raw scores (not per-lens z-scores) keeps a partial lens from being
// standardized against a biased slice of the dex.
function llmSignal() {
  const dir = join(root, "data/popularity/llm");
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")).sort() : [];
  const lenses = {};
  for (const lens of LENSES) {
    const scores = new Map();
    for (const f of files.filter((f) => f.startsWith(`${lens}-`))) {
      for (const [dex, v] of Object.entries(JSON.parse(readFileSync(join(dir, f), "utf8")))) {
        if (Number.isFinite(v) && v >= 1 && v <= 10) scores.set(Number(dex), v);
      }
    }
    lenses[lens] = source(`data/popularity/llm/${lens}-*.json`, `llm.${lens}`, scores.size ? scores : null);
  }
  const out = new Map();
  for (const dex of DEX) {
    const vals = LENSES.map((l) => lenses[l]?.get(dex)).filter((v) => v != null);
    if (vals.length) out.set(dex, mean(vals));
  }
  return { values: out, lenses };
}

// Polls: each source gives score = 1 - (rank - 1) / U, where U is the number of
// species the poll ranked from, not the list length, so 30th of 890 scores 0.97
// instead of 0.03. Absent from a list = no information.
function pollSignal() {
  const polls = read("data/popularity/polls.json");
  if (!polls?.sources?.length) return null;
  const universeOf = (s) => {
    const n = Number(s.scope?.match(/all ([\d,]+) species/)?.[1]?.replace(/,/g, ""));
    return Math.max(Number.isFinite(n) && n > 0 ? n : DEX.length, ...s.ranking.map((r) => r.rank));
  };
  // Per-region top lists: rank them overall by votes (comparable across regions).
  const byVotes = (ranking) => {
    const votes = ranking.map((r) => r.votes);
    return ranking.map((r) => ({ dex: r.dex, rank: 1 + votes.filter((v) => v > r.votes).length }));
  };
  const sources = polls.sources.filter((s) => Array.isArray(s.ranking) && s.ranking.length);
  const regional = new Map(sources.filter((s) => s.rankScope === "region").map((s) => [s.url, s]));
  const used = [];
  for (const s of sources) {
    if (s.rankScope === "region") continue;
    const sibling = regional.get(s.url);
    if (sibling) {
      // Same ballots as the overall top list, so use the longer regional order in its place.
      used.push({ name: sibling.name, ranking: byVotes(sibling.ranking), universe: universeOf(s) });
      regional.delete(s.url);
      notes.push(`"${s.name}" replaced by its per-region lists ranked overall by votes (same ballots)`);
    } else {
      used.push({ name: s.name, ranking: s.ranking, universe: universeOf(s) });
    }
  }
  for (const s of regional.values()) used.push({ name: s.name, ranking: byVotes(s.ranking), universe: universeOf(s) });
  const perSpecies = new Map();
  for (const { ranking, universe } of used) {
    for (const { dex, rank } of ranking) {
      if (!perSpecies.has(dex)) perSpecies.set(dex, []);
      perSpecies.get(dex).push(1 - (rank - 1) / universe);
    }
  }
  const out = new Map();
  for (const [dex, scores] of perSpecies) if (regionOf.has(dex)) out.set(dex, mean(scores));
  return { values: out, used };
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

// z-scores over the species that have a value; population standard deviation.
function standardize(values) {
  if (!values?.size) return null;
  const xs = [...values.values()];
  const mu = mean(xs);
  const sd = Math.sqrt(mean(xs.map((x) => (x - mu) ** 2))) || 1;
  return new Map([...values].map(([dex, x]) => [dex, (x - mu) / sd]));
}

const llm = llmSignal();
const enwikiRaw = source("data/popularity/enwiki.json", "enwiki", fromObject(read("data/popularity/enwiki.json"), (r) => Math.log1p(r.views)));
const tcgJson = read("data/popularity/tcg.json");
const tcgAll = source("data/popularity/tcg.json", "tcg", fromObject(tcgJson, (r) => Math.log1p(r.all)));
const tcgRecent = fromObject(tcgJson, (r) => Math.log1p(r.since2020));
const wikidataRaw = source("data/popularity/wikidata.json", "wikidata", fromObject(read("data/popularity/wikidata.json"), (r) => Math.log1p(r.sitelinks)));
const polls = pollSignal();
source("data/popularity/polls.json", "polls", polls?.values ?? null);

// TCG: all-time card count favours species printed for 25+ years, so blend it
// 50/50 with cards since 2020 (what kids pull from packs now), then re-standardize.
function tcgSignal() {
  const zAll = standardize(tcgAll);
  const zRecent = standardize(tcgRecent);
  if (!zAll || !zRecent) return zAll ?? zRecent;
  const blend = new Map();
  for (const dex of DEX) {
    const vals = [zAll.get(dex), zRecent.get(dex)].filter((v) => v != null);
    if (vals.length) blend.set(dex, mean(vals));
  }
  return standardize(blend);
}

const z = {
  llm: standardize(llm.values),
  enwiki: standardize(enwikiRaw),
  tcg: tcgSignal(),
  wikidata: standardize(wikidataRaw),
  polls: standardize(polls?.values),
};

for (const [signal, values] of Object.entries(z)) {
  const have = values ? DEX.filter((d) => values.has(d)).length : 0;
  if (have === 0) notes.push(`${signal}: input missing, weight ${WEIGHTS[signal]} dropped and the rest re-normalized`);
  else if (have < DEX.length) notes.push(`${signal}: ${have}/${DEX.length} species, weights re-normalized for the rest`);
}
for (const lens of LENSES) {
  const have = llm.lenses[lens] ? DEX.filter((d) => llm.lenses[lens].has(d)).length : 0;
  if (have < DEX.length) notes.push(`llm lens ${lens}: ${have}/${DEX.length} species`);
}

const scored = DEX.map((dex) => {
  let sum = 0;
  let weight = 0;
  for (const [signal, w] of Object.entries(WEIGHTS)) {
    const v = z[signal]?.get(dex);
    if (v == null) continue;
    sum += w * v;
    weight += w;
  }
  if (weight === 0) throw new Error(`species ${dex} has no signal at all`);
  return { dex, score: sum / weight };
});
scored.sort((a, b) => b.score - a.score || a.dex - b.dex);

const overrides = read("data/popularity-overrides.json");
const ranked = overrides ? applyOverrides(scored, overrides) : scored;
if (overrides) {
  const count = Object.keys(overrides).length;
  notes.push(`${count} override(s) applied from data/popularity-overrides.json`);
  generatedFrom.push({ path: "data/popularity-overrides.json", signal: "overrides", species: count });
}

const round = (x, places) => (x == null ? null : Number(x.toFixed(places)));

const species = {};
const byDex = [...ranked.entries()].sort(([, a], [, b]) => a.dex - b.dex);
for (const [i, { dex, score }] of byDex) {
  species[dex] = {
    rank: i + 1,
    tier: tierOfRank(i + 1),
    score: round(score, 4),
    signals: Object.fromEntries(Object.keys(WEIGHTS).map((s) => [s, round(z[s]?.get(dex), 3)])),
  };
}

const method = [
  "Composite = weighted mean of per-signal z-scores (population SD, over the species that have the signal): 0.40 llm, 0.25 enwiki, 0.15 tcg, 0.10 wikidata, 0.10 polls. When a species lacks a signal its other weights are re-normalized to sum to 1.",
  "Transforms: log1p on enwiki 12-month views, TCG card counts and Wikidata sitelinks.",
  "llm = mean of the raw 1-10 lens scores present (kid2026, parent, merch), then z-scored. Raw scores are averaged instead of per-lens z-scores because merch only covers part of the dex; on dex 1-512 merch differs from mean(kid2026, parent) by +0.01 on average, so a missing merch score does not bias a species.",
  "tcg = z of the 50/50 blend of z(log1p(all cards)) and z(log1p(cards since 2020)). All-time counts favour species printed since 1996; the recent count reflects what kids pull from packs now.",
  "polls: per source, score = 1 - (rank - 1) / U, with U = the number of species the poll ranked from (the 'all N species' in its scope, else 1025), not the list length, so a top-30 list does not score its 30th place near 0. Absent = no information. Species score = mean over the sources that list it, then z-scored over the species with a value.",
  "Pokémon of the Year 2020: the per-region top-30 lists are ranked overall by their votes (comparable across regions) and used in place of the worldwide top 30, which is the first 30 of that same vote order, so the same ballots are not counted twice.",
  `Ranks 1-${DEX.length} by composite (ties by dex). Tiers by rank: ${TIERS.map((t) => `${t.tier} ${t.label} ${t.from}-${t.to}`).join(", ")}.`,
  "Hand overrides in data/popularity-overrides.json (each with a reason) then move species: a rank override takes that exact rank, and a tier override puts the species in that tier, or pins it there when it is already in it. Tiers keep their sizes: the slots a tier has left after rank overrides go to the species overridden into it, then to the rest in composite order.",
  `Gaps this run: ${notes.length ? notes.join("; ") : "none"}.`,
].join(" ");

const out = {
  method,
  cutoffs: Object.fromEntries(TIERS.map(({ tier, label, from, to }) => [tier, { label, from, to }])),
  generatedFrom,
  species,
};
writeFileSync(join(root, "data/popularity.json"), `${JSON.stringify(out, null, 2)}\n`);

console.log(`wrote data/popularity.json (${DEX.length} species)`);
for (const n of notes) console.log(`  note: ${n}`);
if (polls) for (const p of polls.used) console.log(`  poll: ${p.name} (${p.ranking.length} listed, U=${p.universe})`);
