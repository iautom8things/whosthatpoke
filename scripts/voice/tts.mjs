#!/usr/bin/env node
// Render speech clips with OpenAI from a job file.
//
//   with-openai node scripts/voice/tts.mjs <jobs.json> <out-dir> [--concurrency 4] [--force]
//
// jobs.json is an array of { id, input, model, voice, instructions?, speed?, format? }.
// model "gpt-4o-mini-tts" or "tts-1-hd" goes through /v1/audio/speech. A "gpt-audio*" model goes
// through chat completions with audio output, told to say the input word for word; its transcript
// is saved next to the clip so a paraphrase can be caught.
// Each clip lands at <out-dir>/<id>.<format> (default wav). Existing clips are skipped unless --force.
// The pipeline (render.mjs, slice.mjs, names.mjs) calls renderJobs() with the same jobs.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isMain } from "./lib/common.mjs";
import { speak } from "./lib/openai.mjs";

/** Renders one job to `file` (through a temp file, so a killed run leaves no half clip). */
export async function renderJob(job, file) {
  const out = await speak(job, job.format ?? "wav");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.tmp`, out.audio);
  renameSync(`${file}.tmp`, file);
  if (out.transcript !== undefined) writeFileSync(file.replace(/\.\w+$/, ".transcript.txt"), out.transcript);
  return out;
}

/**
 * Renders every job whose clip is missing. `onDone(job, file, out)` runs after each new clip. Returns
 * the number of failures; each one is logged.
 */
export async function renderJobs(jobs, outDir, { concurrency = 4, force = false, onDone } = {}) {
  mkdirSync(outDir, { recursive: true });
  let failed = 0;
  const queue = [...jobs];
  async function worker() {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const file = job.file ?? join(outDir, `${job.id}.${job.format ?? "wav"}`);
      if (existsSync(file) && !force) continue;
      try {
        const out = await renderJob(job, file);
        await onDone?.(job, file, out);
      } catch (err) {
        failed++;
        console.error(`${job.id}: ${err.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return failed;
}

if (isMain(import.meta.url)) {
  const [jobsPath, outDir] = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && !all[i - 1]?.startsWith("--concurrency"));
  if (!jobsPath || !outDir) {
    console.error("usage: tts.mjs <jobs.json> <out-dir> [--concurrency 4] [--force]");
    process.exit(1);
  }
  const i = process.argv.indexOf("--concurrency");
  const jobs = JSON.parse(readFileSync(jobsPath, "utf8"));
  let n = 0;
  const failed = await renderJobs(jobs, outDir, {
    concurrency: i === -1 ? 4 : Number(process.argv[i + 1]),
    force: process.argv.includes("--force"),
    onDone: () => ++n % 25 === 0 && console.log(`${n} rendered`),
  });
  console.log(`${jobs.length - failed} rendered or present, ${failed} failed, in ${outDir}`);
  process.exit(failed ? 1 : 0);
}
