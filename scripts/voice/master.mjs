#!/usr/bin/env node
// Masters every take to the MP3 the game ships (plan.md section 8, step 5).
//
//   node scripts/voice/master.mjs [--dex ...] [--only ...] [--force]
//
// Per take: high-pass, trim the two ends to master.leadMs / tailMs (choiceTailMs for choice slices), the
// config's effects chain for the kind, then a static gain measured with EBU R128 to `lufs`, a limiter at
// master.limitDb and libmp3lame mono at master.sampleRate and `bitrate`. A take that misses the target by
// more than 0.75 LU after the limiter is encoded again with the gain corrected. MP3 at 48 kbps can add 2.5 dB
// of peak overshoot, so a take that decodes above -1 dBFS is encoded again with the limiter lowered (up to
// three more passes in all).
// Choice slices are normalized one by one too:
// the four names of a stitched line come from four different carriers, and a carrier-wide gain left them
// up to 6 LU apart in the sample.
// Output: <work>/master/<take>~<hash>.mp3 plus a .json with ms, bytes and loudness.
import { existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { availableParallelism } from "node:os";
import { basename, join } from "node:path";
import { duration, ffmpeg, levels, trimChain } from "./lib/audio.mjs";
import { context, isMain, pool, sha, writeJson } from "./lib/common.mjs";
import { buildPlan, directionKind, source } from "./lib/plan.mjs";

// Bump when the mastering steps change, so every take is mastered again.
const MASTER_VERSION = 3;

const effectsFor = (config, kind) => config.effects?.[directionKind(kind)] ?? config.effects?.["*"] ?? "";

/** The filter chain before the gain: clean-up, trim, effects, and a second tail trim when effects ring on. */
function chain(config, kind) {
  const m = config.master;
  const tailMs = kind.startsWith("choice") ? m.choiceTailMs : m.tailMs;
  const fx = effectsFor(config, kind);
  return [
    `highpass=f=${m.highpassHz}`,
    trimChain({ trimDb: m.trimDb, leadMs: m.leadMs, tailMs }),
    fx,
    fx && `areverse,silenceremove=start_periods=1:start_threshold=-60dB:start_silence=${tailMs / 1000},areverse`,
  ]
    .filter(Boolean)
    .join(",");
}

/** Where a take's MP3 goes. The hash covers its source and every setting that changes the result. */
export function masterFile(ctx, clip, src) {
  const { config } = ctx;
  const hash = sha([MASTER_VERSION, src.file, src.cuts ?? null, chain(config, clip.kind), config.lufs, config.bitrate, config.master]).slice(0, 10);
  return join(ctx.work, "master", `${clip.id}~${hash}.mp3`);
}

export const sidecar = (mp3) => mp3.replace(/\.mp3$/, ".json");

async function prepare(ctx, kind, file, tmp) {
  await ffmpeg(["-i", file, "-af", chain(ctx.config, kind), "-ar", String(ctx.config.master.sampleRate), "-ac", "1", "-c:a", "pcm_f32le", "-f", "wav", tmp]);
  return duration(tmp);
}

async function encode(ctx, tmp, gain, out, limitDb = ctx.config.master.limitDb) {
  const { master: m, bitrate } = ctx.config;
  const limit = 10 ** (limitDb / 20);
  await ffmpeg([
    "-i", tmp,
    "-af", `volume=${gain.toFixed(2)}dB,alimiter=limit=${limit.toFixed(4)}:attack=2:release=40:level=false`,
    "-ar", String(m.sampleRate), "-ac", "1",
    "-c:a", "libmp3lame", "-b:a", bitrate,
    "-map_metadata", "-1", "-id3v2_version", "0", "-write_id3v1", "0",
    "-f", "mp3", `${out}.tmp`,
  ]);
  renameSync(`${out}.tmp`, out);
}

export async function run(ctx) {
  const plan = buildPlan(ctx);
  const tmpDir = join(ctx.work, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  mkdirSync(join(ctx.work, "master"), { recursive: true });
  const target = ctx.config.lufs;

  const count = { made: 0, cached: 0, missing: [] };
  const failed = await pool(
    plan.clips,
    availableParallelism(),
    async (clip) => {
      const src = source(plan, clip);
      if (!existsSync(src.file)) return void count.missing.push(clip.id);
      const out = masterFile(ctx, clip, src);
      if (existsSync(sidecar(out)) && !ctx.args.force) return void count.cached++;
      const tmp = join(tmpDir, `${basename(out)}.wav`);
      const seconds = await prepare(ctx, clip.kind, src.file, tmp);
      let gain = target - (await levels(tmp, seconds)).lufs;
      let limitDb = ctx.config.master.limitDb;
      await encode(ctx, tmp, gain, out);
      let { lufs, peak } = await levels(out, seconds);
      // The codec's overshoot jumps around (lowering the ceiling 0.5 dB once raised a decoded peak 1.6 dB),
      // so this is a short loop rather than one correction.
      for (let tries = 0; tries < 3 && (Math.abs(lufs - target) > 0.75 || peak > -1); tries++) {
        if (Math.abs(lufs - target) > 0.75) gain += target - lufs;
        if (peak > -1) limitDb -= Math.max(0.5, peak + 1.3);
        await encode(ctx, tmp, gain, out, limitDb);
        ({ lufs, peak } = await levels(out, seconds));
      }
      rmSync(tmp, { force: true });
      writeJson(sidecar(out), {
        key: clip.key,
        take: clip.take,
        ms: Math.round((await duration(out)) * 1000),
        bytes: statSync(out).size,
        lufs: Number(lufs.toFixed(1)),
        peak: Number(peak.toFixed(1)),
        gain: Number(gain.toFixed(2)),
        limitDb: Number(limitDb.toFixed(1)),
        src: src.file,
      });
      count.made++;
    },
    "master ",
  );
  console.log(`master: ${count.made} mastered, ${count.cached} cached, ${count.missing.length} without audio yet${count.missing.length ? ` (${count.missing.slice(0, 8).join(", ")}${count.missing.length > 8 ? ", ..." : ""})` : ""}`);
  return failed + count.missing.length;
}

if (isMain(import.meta.url)) process.exit((await run(context())) ? 1 : 0);
