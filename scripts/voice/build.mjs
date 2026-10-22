#!/usr/bin/env node
// One command from a voice config to public/voice/: manifest, names, render, slice, master, pack, qa.
//
//   scratchpad/bin/with-openai node scripts/voice/build.mjs [--config data/voice/voice.json] [--out public/voice]
//     [--work ~/.cache/whosthatpoke-voice] [--report data/voice/qa] [--dex 1-151] [--only "line.*,reveal.*"]
//     [--concurrency 8] [--retakes 1] [--steps render,slice,master,pack,qa]
//
// Every step skips work whose output already exists (outputs are named by a hash of their inputs), so a
// killed run resumes where it stopped, and a changed respelling or direction re-renders only what it touches.
// --retakes N runs N rounds of qa --retake after the first check. See README.md.
import { join } from "node:path";
import { context, isMain, usd } from "./lib/common.mjs";
import { meter } from "./lib/openai.mjs";
import { markRetakes } from "./qa.mjs";

const STEPS = ["manifest", "names", "render", "slice", "master", "pack", "qa"];

export async function build(ctx) {
  const steps = ctx.args.steps ? ctx.args.steps.split(",").map((s) => s.trim()) : STEPS;
  const unknown = steps.filter((s) => !STEPS.includes(s));
  if (unknown.length) throw new Error(`unknown steps: ${unknown.join(", ")}`);
  const started = Date.now();
  const problems = {};
  const step = async (name) => {
    const t0 = Date.now();
    console.log(`\n== ${name}`);
    const result = await (await import(`./${name}.mjs`)).run(ctx);
    const failed = typeof result === "number" ? result : result.failed;
    if (failed) problems[name] = (problems[name] ?? 0) + failed;
    console.log(`== ${name} done in ${((Date.now() - t0) / 1000).toFixed(0)} s · ${usd(meter.total)} so far this run`);
    return result;
  };
  let qa = null;
  for (const name of STEPS.filter((s) => steps.includes(s))) {
    const result = await step(name);
    if (name === "qa") qa = result;
  }
  for (let round = 1; qa && round <= Number(ctx.args.retakes ?? 0) && qa.retake.length; round++) {
    const bumped = markRetakes(ctx, qa.retake);
    console.log(`\n== retake round ${round}: ${bumped} takes`);
    if (!bumped) break;
    for (const name of ["render", "slice", "master", "pack"]) await step(name);
    qa = await step("qa");
  }
  const by = Object.entries(meter.spent).map(([k, v]) => `${k} ${usd(v)}`).join(", ");
  console.log(`\nbuild: ${((Date.now() - started) / 60000).toFixed(1)} min, ${usd(meter.total)} this run (${by || "nothing spent"}), ${usd(meter.allTime())} recorded in ${ctx.work}`);
  if (Object.keys(problems).length) console.log(`build: unfinished work in ${Object.entries(problems).map(([k, v]) => `${k} (${v})`).join(", ")}; run the same command again to resume`);
  return Object.keys(problems).length;
}

if (isMain(import.meta.url)) {
  const ctx = context();
  meter.configure(join(ctx.work, "cost.jsonl"), ctx.config.prices);
  process.exit((await build(ctx)) ? 1 : 0);
}
