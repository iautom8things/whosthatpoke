#!/usr/bin/env node
// Renders every take the selection needs to 24 kHz WAV under <work>/raw, through tts.mjs jobs.
//
//   node scripts/voice/render.mjs [--dex 1-151] [--only "line.*"] [--concurrency 8] [--dry-run]
//
// Names are filled in from data/voice/names.json; a name it has no entry for is read plain, with a warning.
// A reveal reuses the take names.mjs judged when the job is identical. Choice carriers get their first
// attempt here; slice.mjs re-renders a carrier that will not split and renders single fallbacks.
// The jobs that ran are written to <work>/jobs.json, which tts.mjs can replay by hand.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { duration } from "./lib/audio.mjs";
import { context, isMain, usd, writeJson } from "./lib/common.mjs";
import { meter } from "./lib/openai.mjs";
import { buildPlan } from "./lib/plan.mjs";
import { renderJobs } from "./tts.mjs";

export async function run(ctx) {
  const plan = buildPlan(ctx);
  if (plan.unjudged.length) console.warn(`render: no names.json entry under ${ctx.fp} for ${plan.unjudged.join(", ")}; read plain`);
  const reused = plan.clips.filter((c) => c.kind === "reveal" && !c.job).length;
  const jobs = [...plan.clips.filter((c) => c.job).map((c) => c.job), ...plan.carriers.map((c) => c.attempt(0))];
  const todo = jobs.filter((j) => !existsSync(j.file));
  console.log(`render: ${jobs.length} jobs (${plan.carriers.length} choice carriers), ${jobs.length - todo.length} cached, ${todo.length} to render; ${reused} reveals reuse their judged take`);
  writeJson(join(ctx.work, "jobs.json"), todo.map(({ hash, file, ...j }) => j));
  if (ctx.args["dry-run"] || todo.length === 0) return 0;
  let n = 0;
  const failed = await renderJobs(todo, join(ctx.work, "raw"), {
    concurrency: ctx.concurrency,
    onDone: async (j, file) => {
      meter.speech("render", j, await duration(file));
      if (++n % 50 === 0 || n === todo.length) console.log(`  ${n}/${todo.length} rendered · ${usd(meter.spent.render ?? 0)}`);
    },
  });
  if (failed) console.error(`render: ${failed} failed; run again to retry them`);
  return failed;
}

if (isMain(import.meta.url)) {
  const ctx = context();
  meter.configure(join(ctx.work, "cost.jsonl"), ctx.config.prices);
  process.exit((await run(ctx)) ? 1 : 0);
}
