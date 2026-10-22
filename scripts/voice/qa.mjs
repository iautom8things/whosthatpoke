#!/usr/bin/env node
// Checks every mastered take by machine and writes the list of takes to redo or to hear (plan.md section 8, step 7).
//
//   node scripts/voice/qa.mjs [--report data/voice/qa] [--dex ...] [--only ...] [--concurrency 8] [--retake]
//
// Each take is transcribed with gpt-transcribe (cached by file, so only new takes cost anything) and
// compared word by word with its manifest text. Literal words that are missing, swapped or added mark the
// take "retake" (any edit in a short line; more than 10% of the words in a fact). Name slots never fail a
// take: a name heard far from both its spelling and its respelling, or one names.mjs left on the review
// list, is marked "listen". A take under qa.short or over qa.long times the length its syllables predict
// (calibrated per kind on this run) is a "retake": that catches truncation, double reads and ad-libs.
// Writes <report>.json and <report>.md. --retake bumps each retake take's nonce (at most qa.maxRetakes
// times), then re-runs render, slice, master, pack and this check for them.
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { context, isMain, pool, readJson, usd, writeJson } from "./lib/common.mjs";
import { meter, transcribe } from "./lib/openai.mjs";
import { buildPlan, namesBook, retakesPath, source } from "./lib/plan.mjs";
import { alignWords, expectedWords, similarity, slotIds, syllables, words } from "./lib/text.mjs";
import { masterFile, sidecar } from "./master.mjs";

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};

function check(ctx, it, rate, book) {
  const { clip } = it;
  const q = ctx.config.qa;
  const flags = [];
  const heard = words(it.transcript);
  const expected = expectedWords(clip.template, clip.official);
  const { edits, slots } = alignWords(expected, heard);
  const hard = expected.filter((e) => !e.slot).length;
  if (heard.length === 0) flags.push({ severity: "retake", why: "nothing transcribed" });
  else if (edits.length > (hard >= 10 ? Math.floor(hard * 0.1) : 0)) flags.push({ severity: "retake", why: edits.join("; ") });
  else if (edits.length) flags.push({ severity: "listen", why: edits.join("; ") });
  const ratio = it.ms / (syllables(clip.input) * rate[clip.kind]);
  if (ratio < q.short || ratio > q.long) flags.push({ severity: "retake", why: `${ratio.toFixed(2)}x the expected length` });
  for (const id of slotIds(clip.template)) {
    const got = slots[id] ?? "";
    const said = book[id]?.input ?? clip.official[id];
    const sim = Math.max(similarity(got, clip.official[id]), similarity(got, said));
    if (sim < q.nameSimilarity) flags.push({ severity: "listen", why: `${clip.official[id]} ("${said}") transcribed as "${got}"` });
    if (book[id]?.status === "review" && clip.kind === "reveal") flags.push({ severity: "listen", why: `${clip.official[id]} is on the names review list` });
  }
  return { ratio, flags };
}

function markdown(report) {
  const row = (f) => `| \`${f.id}\` | ${f.why.replace(/\|/g, "/")} | ${f.transcript.replace(/\|/g, "/")} |`;
  const table = (list) => ["| take | why | transcript |", "|---|---|---|", ...list.map(row)].join("\n");
  return [
    `# Voice QA: ${report.voice}`,
    "",
    `${report.takes} takes, ${report.minutes} minutes, checked ${report.at}. ${report.retake.length} to retake, ${report.listen.length} to hear. QA transcription this run: ${usd(report.cost.qa)}; all steps so far in this work dir: ${usd(report.cost.allTime)}.`,
    "",
    `Seconds per syllable by kind: ${Object.entries(report.secondsPerSyllable).map(([k, v]) => `${k} ${v}`).join(", ")}.`,
    "",
    "## Retake",
    "",
    report.retake.length ? table(report.retake) : "None.",
    "",
    "## Hear these",
    "",
    report.listen.length ? table(report.listen) : "None.",
    "",
  ].join("\n");
}

export async function run(ctx) {
  const plan = buildPlan(ctx);
  const book = namesBook(ctx);
  const model = ctx.config.judge.transcribe;
  const items = [];
  for (const clip of plan.clips) {
    const src = source(plan, clip);
    const mp3 = masterFile(ctx, clip, src);
    const meta = readJson(sidecar(mp3));
    if (meta) items.push({ clip, mp3, ms: meta.ms });
  }
  const before = meter.spent.qa ?? 0;
  const failed = await pool(
    items,
    ctx.concurrency,
    async (it) => {
      const cache = join(ctx.work, "qa", basename(it.mp3).replace(/\.mp3$/, ".json"));
      let t = readJson(cache);
      if (!t) {
        t = { text: await transcribe(it.mp3, { model, seconds: it.ms / 1000, step: "qa" }) };
        writeJson(cache, t);
      }
      it.transcript = t.text;
    },
    "qa ",
  );
  const done = items.filter((it) => it.transcript !== undefined);
  const rate = {};
  for (const kind of new Set(done.map((it) => it.clip.kind))) {
    rate[kind] = median(done.filter((it) => it.clip.kind === kind).map((it) => it.ms / syllables(it.clip.input)));
  }
  const retake = [];
  const listen = [];
  for (const it of done) {
    const { flags } = check(ctx, it, rate, book);
    for (const sev of ["retake", "listen"]) {
      const why = flags.filter((f) => f.severity === sev).map((f) => f.why);
      if (why.length) (sev === "retake" ? retake : listen).push({ id: it.clip.id, why: why.join("; "), transcript: it.transcript, input: it.clip.input, ms: it.ms });
    }
  }
  const report = {
    voice: ctx.fp,
    at: new Date().toISOString(),
    takes: done.length,
    unchecked: items.length - done.length,
    minutes: Number((done.reduce((s, it) => s + it.ms, 0) / 60000).toFixed(1)),
    secondsPerSyllable: Object.fromEntries(Object.entries(rate).map(([k, v]) => [k, Number((v / 1000).toFixed(3))])),
    cost: { qa: (meter.spent.qa ?? 0) - before, allTime: meter.allTime() },
    retake,
    listen,
  };
  mkdirSync(dirname(ctx.report), { recursive: true });
  writeJson(`${ctx.report}.json`, report);
  writeFileSync(`${ctx.report}.md`, markdown(report));
  console.log(`qa: ${done.length} takes checked, ${retake.length} to retake, ${listen.length} to hear; report at ${ctx.report}.md`);
  return { failed, retake };
}

/** Bumps the nonce of each retake take, up to qa.maxRetakes. Returns how many were bumped. */
export function markRetakes(ctx, retake) {
  const all = readJson(retakesPath(ctx), {});
  const mine = (all[ctx.fp] ??= {});
  let n = 0;
  for (const r of retake) {
    if ((mine[r.id] ?? 0) >= ctx.config.qa.maxRetakes) continue;
    mine[r.id] = (mine[r.id] ?? 0) + 1;
    n++;
  }
  writeJson(retakesPath(ctx), all);
  return n;
}

if (isMain(import.meta.url)) {
  const ctx = context();
  meter.configure(join(ctx.work, "cost.jsonl"), ctx.config.prices);
  let { failed, retake } = await run(ctx);
  if (ctx.args.retake && retake.length) {
    const bumped = markRetakes(ctx, retake);
    console.log(`qa: retaking ${bumped} takes`);
    if (bumped) {
      for (const step of ["render", "slice", "master", "pack"]) failed += await (await import(`./${step}.mjs`)).run(ctx);
      failed += (await run(ctx)).failed;
    }
  }
  process.exit(failed ? 1 : 0);
}
