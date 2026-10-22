#!/usr/bin/env node
// Cuts each choice carrier, "Is it A, B, C, or D?", at its three comma pauses (plan.md section 3).
//
//   node scripts/voice/slice.mjs [--dex ...] [--concurrency 8] [--force]
//
// silencedetect finds pauses (choices.silenceDb, at least choices.minSilenceMs); lib/text.mjs chooseCuts
// picks the three that are long and sit where the syllable counts put the commas, and the four parts must
// each run a plausible share of the carrier. A carrier that will not split is re-rendered, up to
// choices.attempts in all. After that its names fall back to single renders with a position direction.
// Each carrier's outcome is <work>/slices/<carrier>.json; the slices sit beside it.
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { cut, duration, silences } from "./lib/audio.mjs";
import { context, isMain, pool, readJson, writeJson } from "./lib/common.mjs";
import { meter } from "./lib/openai.mjs";
import { buildPlan, needsSingle } from "./lib/plan.mjs";
import { chooseCuts } from "./lib/text.mjs";
import { renderJob, renderJobs } from "./tts.mjs";

const r3 = (n) => Number(n.toFixed(3));

/** Every part, edge silence aside, runs at least 0.25 s and within a factor of 2.5 of its syllable share. */
function plausible(cuts, weights, { silences: sil, total }) {
  const start = sil.find((s) => s.start <= 0.05)?.end ?? 0;
  const end = sil.find((s) => s.end >= total - 0.05)?.start ?? total;
  const bounds = [start, ...cuts, end];
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.every((w, k) => {
    const len = bounds[k + 1] - bounds[k];
    const ratio = len / (end - start) / (w / sum);
    return len >= 0.25 && ratio > 0.4 && ratio < 2.5;
  });
}

export async function run(ctx) {
  const plan = buildPlan(ctx);
  const { silenceDb, minSilenceMs, attempts } = ctx.config.choices;
  const count = { split: 0, retried: 0, fallback: 0 };
  let failed = await pool(
    plan.carriers,
    ctx.concurrency,
    async (c) => {
      const prior = readJson(c.result);
      if (prior && !ctx.args.force) return void count[prior.ok ? "split" : "fallback"]++;
      let last = null;
      for (let a = 0; a < attempts; a++) {
        const j = c.attempt(a);
        if (!existsSync(j.file)) {
          await renderJob(j, j.file);
          meter.speech("slice", j, await duration(j.file));
          count.retried++;
        }
        const found = await silences(j.file, silenceDb, minSilenceMs / 1000);
        const cuts = chooseCuts(found.silences, found.total, c.weights);
        if (cuts && plausible(cuts, c.weights, found)) {
          const bounds = [0, ...cuts, found.total];
          const dir = join(ctx.work, "slices", j.id);
          mkdirSync(dir, { recursive: true });
          const files = [0, 1, 2, 3].map((k) => join(dir, `${k}.wav`));
          for (let k = 0; k < 4; k++) await cut(j.file, bounds[k], bounds[k + 1], files[k]);
          writeJson(c.result, { ok: true, attempt: a, raw: j.file, input: c.input, cuts: cuts.map(r3), slices: files });
          count.split++;
          return;
        }
        last = { attempt: a, silences: found.silences.map((s) => [r3(s.start), r3(s.end)]), total: r3(found.total) };
      }
      writeJson(c.result, { ok: false, input: c.input, last });
      count.fallback++;
    },
    "slice ",
  );
  console.log(`slice: ${count.split} carriers split, ${count.fallback} fell back to single renders, ${count.retried} re-rendered`);

  // Takes whose carrier would not split, and choice retakes, are rendered on their own.
  const singles = plan.clips.filter((c) => c.pos && needsSingle(plan, c) && !existsSync(c.single.file)).map((c) => c.single);
  if (singles.length) {
    console.log(`slice: rendering ${singles.length} single choice takes`);
    failed += await renderJobs(singles, join(ctx.work, "raw"), {
      concurrency: ctx.concurrency,
      onDone: async (j, file) => meter.speech("slice", j, await duration(file)),
    });
  }
  return failed;
}

if (isMain(import.meta.url)) {
  const ctx = context();
  meter.configure(join(ctx.work, "cost.jsonl"), ctx.config.prices);
  process.exit((await run(ctx)) ? 1 : 0);
}
