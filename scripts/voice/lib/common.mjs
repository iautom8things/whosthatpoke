// Shared plumbing for the voice pipeline: flags, config, paths, selection, JSON files and a worker pool.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";

export const ROOT = resolve(new URL("../../..", import.meta.url).pathname);

// Knobs the voice audition does not need to touch. data/voice/voice.json overrides any of them.
export const DEFAULTS = {
  model: "gpt-4o-mini-tts",
  voice: "ash",
  speed: 1,
  instructions: "",
  direction: {},
  /** Extra direction for a choice name rendered on its own (a carrier that would not split). */
  positions: {
    first: "This is the first name in a spoken list. A slight rise at the end; more names follow.",
    mid: "This is a middle name in a spoken list. A slight rise at the end; more names follow.",
    last: "This is the last name in a spoken list. Fall at the end, like the end of a question.",
  },
  /** ffmpeg -af chains by kind (line, reveal, fact, choices, score, prize); "*" applies to every kind without its own. */
  effects: {},
  lufs: -16,
  bitrate: "48k",
  master: { highpassHz: 70, trimDb: -45, leadMs: 20, tailMs: 120, choiceTailMs: 60, limitDb: -1.5, sampleRate: 24000 },
  pack: { bytes: 1_000_000 },
  choices: { seed: 1025, silenceDb: -40, minSilenceMs: 80, attempts: 3 },
  judge: {
    transcribe: "gpt-transcribe",
    listener: "gpt-audio-1.5",
    comparator: "gpt-5.4-mini",
    /** Low effort passed the "car vowel" Gyarados 2 times in 3; medium got 47 of 48 probe calls right. */
    compareEffort: "medium",
    drafter: "gpt-5.4-mini",
    takes: 3,
    variants: 3,
    rounds: 2,
  },
  qa: { short: 0.5, long: 2, nameSimilarity: 0.4, maxRetakes: 2 },
  prices: {},
};

const OPTIONS = {
  config: { type: "string" },
  work: { type: "string" },
  out: { type: "string" },
  report: { type: "string" },
  manifest: { type: "string" },
  names: { type: "string" },
  dex: { type: "string" },
  only: { type: "string" },
  ids: { type: "string" },
  prizes: { type: "string" },
  concurrency: { type: "string" },
  retakes: { type: "string" },
  steps: { type: "string" },
  force: { type: "boolean" },
  redo: { type: "boolean" },
  retake: { type: "boolean" },
  "dry-run": { type: "boolean" },
  help: { type: "boolean" },
};

const merge = (base, over) => {
  if (!over || typeof over !== "object" || Array.isArray(over)) return over ?? base;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = base && typeof base[k] === "object" && !Array.isArray(base[k]) ? merge(base[k], v) : v;
  return out;
};

export const readJson = (path, fallback = null) => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback);

/** Writes through a temp file and a rename, so a killed run never leaves half a JSON file. */
export function writeJson(path, value, space = 1) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, space) + "\n");
  renameSync(tmp, path);
}

export const sha = (value) => createHash("sha1").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

/** "1-151,384" to a Set of dex numbers. */
export function parseDex(spec) {
  const out = new Set();
  for (const part of spec.split(",").map((s) => s.trim()).filter(Boolean)) {
    const [a, b] = part.split("-").map(Number);
    for (let d = a; d <= (b || a); d++) out.add(d);
  }
  return out;
}

const globRe = (pattern) => new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);

/** Everything a step needs: flags, the merged config, paths and the clip selection. */
export function context(argv = process.argv.slice(2)) {
  const { values: args } = parseArgs({ args: argv, options: OPTIONS, allowPositionals: false });
  const path = (p, fallback) => resolve(ROOT, p ?? fallback);
  const configPath = path(args.config, "data/voice/voice.json");
  const config = merge(DEFAULTS, readJson(configPath, {}));
  const dex = args.dex ? parseDex(args.dex) : null;
  const only = args.only ? args.only.split(",").map((p) => globRe(p.trim())) : null;
  const ctx = {
    args,
    config,
    configPath,
    concurrency: Number(args.concurrency ?? 8),
    manifestPath: path(args.manifest, "data/voice/manifest.json"),
    namesPath: path(args.names, "data/voice/names.json"),
    wordsPath: path(undefined, "data/voice/words.json"),
    work: resolve(args.work ?? process.env.VOICE_WORK ?? join(homedir(), ".cache/whosthatpoke-voice")),
    out: path(args.out, "public/voice"),
    report: path(args.report, "data/voice/qa"),
    /** Voice identity: names judged under one voice say nothing about another. */
    fp: `${config.model}/${config.voice}${config.speed && config.speed !== 1 ? `@${config.speed}` : ""}`,
    selected(entry) {
      if (dex && entry.dex !== undefined && !dex.has(entry.dex)) return false;
      return !only || only.some((re) => re.test(entry.key));
    },
  };
  ctx.fpSlug = ctx.fp.replace(/[^a-z0-9.@-]+/gi, "-");
  return ctx;
}

/** The selected manifest entries. */
export function manifest(ctx) {
  const all = readJson(ctx.manifestPath);
  if (!all) throw new Error(`no manifest at ${ctx.manifestPath}; run manifest.mjs first`);
  return all.filter((e) => ctx.selected(e));
}

/** Runs `fn` over `items` with `n` workers. Failures are logged and counted, never thrown. */
export async function pool(items, n, fn, label = "") {
  const queue = items.map((item, i) => [item, i]);
  let failed = 0;
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      try {
        await fn(next[0], next[1]);
      } catch (err) {
        failed++;
        console.error(`${label}${next[0]?.key ?? next[0]?.id ?? next[0]}: ${err.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, n) }, worker));
  return failed;
}

export const isMain = (url) => process.argv[1] && resolve(process.argv[1]) === new URL(url).pathname;

export const usd = (n) => `$${n.toFixed(n < 1 ? 3 : 2)}`;
