#!/usr/bin/env node
// Builds data/voice/manifest.json: every line the announcer can say with default settings, one entry per clip.
//
//   node scripts/voice/manifest.mjs [--prizes prizes.json] [--manifest data/voice/manifest.json]
//
// Each entry is { key, kind, text, template, names, ... }. `text` is the line as the game shows it, which
// QA compares against. `template` has a {slot} wherever a name is spoken: a dex number for a species, a
// word id from data/voice/words.json otherwise ("pokemon"). names.mjs finds the input text that makes the
// voice say each slot right, and render.mjs fills it in, so keys never depend on spelling.
// --prizes (default data/voice/prizes.json, when present) takes the host's tiers, [{ title, reward }], and
// adds a prize clip for each (plan.md section 5).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { context, isMain, readJson, ROOT } from "./lib/common.mjs";
import { plainName, sentenceCase, slotIds, slug, spoken } from "./lib/text.mjs";

const GAME_LENGTHS = [5, 10, 15];
const SURVIVAL_MAX = 150;
const REVEAL = "It’s {id}!";

const LINES = [
  {
    key: "line.whos-that",
    text: "Who’s that Pokémon?",
    variants: [
      { id: "a", direction: "Classic TV-cartoon reading: a mysterious lean on “Who’s that”, a big rise on the last word." },
      { id: "b", direction: "Slower and spookier, a half-beat hang after “Who’s that”, playful Halloween hush." },
      { id: "c", direction: "Bright and quick, all excitement, the same big rise at the end." },
    ],
    where: ["useGameLoop intro (via whosThat)", "HostScreen new card", "ShowcaseScreen ask slide", "Settings Test sound", "AudioLab"],
  },
  { key: "line.game-over", text: "Game over!", where: ["useGameLoop showGameOver (survival, lives 0)"] },
];

/** The default tiers, read from src/game/scoring.ts so a change there reaches the recordings. */
function defaultTiers() {
  const src = readFileSync(join(ROOT, "src/game/scoring.ts"), "utf8");
  const block = src.slice(src.indexOf("DEFAULT_PRIZE_TIERS"), src.indexOf("];", src.indexOf("DEFAULT_PRIZE_TIERS")));
  const tiers = [...block.matchAll(/minCorrect:\s*(\d+),\s*title:\s*"([^"]+)",\s*reward:\s*"([^"]+)"/g)].map((m) => ({
    minCorrect: Number(m[1]),
    title: m[2],
    reward: m[3],
  }));
  if (tiers.length === 0) throw new Error("could not read DEFAULT_PRIZE_TIERS from src/game/scoring.ts");
  return tiers;
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[’']/g, "['’]");

/** Replaces every species name and table word in `text` with its slot. */
export function slotter(catalog, words) {
  const ids = new Map();
  for (const m of catalog) ids.set(m.name.replace(/'/g, "’"), String(m.dex));
  for (const w of words) ids.set(w.text, w.id);
  const alts = [...ids.keys()].sort((a, b) => b.length - a.length).map(escape);
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts.join("|")})(?![\\p{L}\\p{N}])`, "gu");
  return (text) => text.replace(re, (m) => `{${ids.get(m.replace(/'/g, "’"))}}`);
}

export function buildManifest({ catalog, words, tiers }) {
  const slots = slotter(catalog, words);
  const out = [];
  const add = (entry) => out.push({ ...entry, template: entry.template ?? slots(entry.text), names: slotIds(entry.template ?? slots(entry.text)) });

  for (const line of LINES) add({ ...line, kind: "line" });
  const mons = [...catalog].sort((a, b) => a.dex - b.dex);
  for (const m of mons) {
    const name = plainName(m.name);
    add({ key: `reveal.${m.dex}`, kind: "reveal", dex: m.dex, name: m.name, text: REVEAL.replace("{id}", name), template: REVEAL.replace("id", m.dex) });
  }
  for (const m of mons) if (m.fact) add({ key: `fact.${m.dex}`, kind: "fact", dex: m.dex, name: m.name, text: m.fact });
  const positions = [
    ["first", (s) => `Is it ${s},`],
    ["mid", (s) => `${s},`],
    ["last", (s) => `or ${s}?`],
  ];
  for (const [pos, line] of positions) {
    for (const m of mons) {
      add({ key: `choice.${pos}.${m.dex}`, kind: `choice-${pos}`, dex: m.dex, name: m.name, text: line(plainName(m.name)), template: line(`{${m.dex}}`) });
    }
  }

  add({ key: "score.nice-try", kind: "score", text: "Nice try!", where: ["Summary announcement, correct == 0, any mode"] });
  for (const of of GAME_LENGTHS) for (let n = 1; n < of; n++) add({ key: `score.got.${n}-of-${of}`, kind: "score", text: `You got ${n} out of ${of}!`, n, of });
  for (const of of GAME_LENGTHS) for (let n = 1; n < of; n++) add({ key: `score.team.${n}-of-${of}`, kind: "score", text: `Your team got ${n} out of ${of}!`, n, of });
  for (const of of GAME_LENGTHS) add({ key: `score.perfect.${of}`, kind: "score", text: `Perfect score! ${of} out of ${of}!`, n: of, of });
  for (let n = 1; n <= SURVIVAL_MAX; n++) add({ key: `score.named.${n}`, kind: "score", text: `You named ${n} Pokémon!`, n });

  const top = Math.max(...tiers.map((t) => t.minCorrect ?? 0));
  const seen = new Set();
  for (const tier of tiers) {
    const source = `${tier.title}! ${tier.reward}`;
    const said = spoken(source);
    const key = `prize.${slug(said)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const stress = [...source.matchAll(/\b[A-Z]{3,}\b/g)].map((m) => `Stress “${m[0].toLowerCase()}”.`);
    if (tier.minCorrect === top && tiers.length > 1) stress.push("The top prize: the biggest moment of the night.");
    add({ key, kind: "prize", text: sentenceCase(said), source, ...(stress.length ? { direction: stress.join(" ") } : {}) });
  }
  add({ key: "prize.custom", kind: "prize", text: "Here’s your prize!", source: "(stand-in when a host-typed prize has no recording)" });
  return out;
}

export function run(ctx) {
  const catalog = readJson(join(ROOT, "src/data/catalog.json"));
  const phonetics = readJson(join(ROOT, "data/phonetics.json"));
  const words = readJson(ctx.wordsPath);
  const missing = catalog.filter((m) => !phonetics.some((p) => p.dex === m.dex)).map((m) => m.dex);
  if (missing.length) console.warn(`manifest: no pronunciation target in data/phonetics.json for dex ${missing.join(", ")}`);
  // The host's own tiers: --prizes, or data/voice/prizes.json when it exists, so a later build keeps them.
  const prizes = ctx.args.prizes ?? join(ROOT, "data/voice/prizes.json");
  const extra = readJson(prizes, []);
  const entries = buildManifest({ catalog, words, tiers: [...defaultTiers(), ...extra] });
  // One entry per line, so a change shows up as a readable diff.
  mkdirSync(dirname(ctx.manifestPath), { recursive: true });
  writeFileSync(ctx.manifestPath, `[\n${entries.map((e) => JSON.stringify(e)).join(",\n")}\n]\n`);
  const kinds = Object.entries(Object.groupBy(entries, (e) => e.kind)).map(([k, v]) => `${k} ${v.length}`);
  const named = entries.filter((e) => e.kind === "fact" && e.names.some((id) => /^\d+$/.test(id)));
  console.log(`manifest: ${entries.length} clips (${kinds.join(", ")}); ${named.length} facts name a species; ${extra.length} host prize tiers`);
  return 0;
}

if (isMain(import.meta.url)) process.exit(run(context()));
