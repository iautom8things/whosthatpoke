#!/usr/bin/env node
// Packs the mastered takes into ~1 MB MP3 packs and writes <out>/index.json (plan.md section 7).
//
//   node scripts/voice/pack.mjs [--out public/voice] [--dex ...] [--only ...] [--force]
//
// A pack is MP3 files concatenated byte for byte, so each [offset, offset + bytes) slice is a whole MP3 the
// runtime can hand to decodeAudioData. Packs fill per group in a fixed order: core (lines, scores, prizes in
// manifest order), reveal and fact by dex, choice by dex then first, mid, last.
// index.json follows the voice/build-runtime/contract.md format: { v: 1, voice, model, packs: ["core-0.mp3", ...],
// clips: { "reveal.25": [[pack, offset, bytes, ms]], ... } }, where pack indexes `packs` and each key lists its
// takes ("line.whos-that" has three, a, b, c in order).
// Writing a partial selection over public/voice needs --force, so a sample run cannot clobber the real set.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { context, isMain, readJson, ROOT, writeJson } from "./lib/common.mjs";
import { fillPacks } from "./lib/text.mjs";
import { masterFile, sidecar } from "./master.mjs";
import { buildPlan, source } from "./lib/plan.mjs";

const GROUPS = ["core", "reveal", "choice", "fact"];
const POS = { first: 0, mid: 1, last: 2 };
const PACK = /^(core|reveal|choice|fact)-\d+\.mp3$/;

export async function run(ctx) {
  const plan = buildPlan(ctx);
  const partial = Boolean(ctx.args.dex || ctx.args.only);
  if (partial && resolve(ctx.out) === resolve(ROOT, "public/voice") && !ctx.args.force) {
    throw new Error("pack: refusing to write a partial selection to public/voice; pass --out, or --force");
  }
  const items = [];
  const missing = [];
  for (const clip of plan.clips) {
    const src = source(plan, clip);
    const mp3 = existsSync(src.file) ? masterFile(ctx, clip, src) : null;
    const meta = mp3 && readJson(sidecar(mp3));
    if (meta) items.push({ clip, mp3, bytes: meta.bytes, ms: meta.ms });
    else missing.push(clip.id);
  }
  const order = (a, b) => (a.clip.dex ?? 0) - (b.clip.dex ?? 0) || (POS[a.clip.pos] ?? 0) - (POS[b.clip.pos] ?? 0);

  mkdirSync(ctx.out, { recursive: true });
  const packs = [];
  const clips = {};
  for (const group of GROUPS) {
    const members = items.filter((it) => it.clip.group === group);
    if (group !== "core") members.sort(order);
    for (const [n, pack] of fillPacks(members, ctx.config.pack.bytes).entries()) {
      const name = `${group}-${n}.mp3`;
      const index = packs.push(name) - 1;
      let offset = 0;
      const bufs = pack.items.map((it) => readFileSync(it.mp3));
      pack.items.forEach((it, k) => {
        (clips[it.clip.key] ??= []).push([index, offset, bufs[k].length, it.ms]);
        offset += bufs[k].length;
      });
      writeFileSync(join(ctx.out, `${name}.tmp`), Buffer.concat(bufs));
      renameSync(join(ctx.out, `${name}.tmp`), join(ctx.out, name));
    }
  }
  for (const f of readdirSync(ctx.out)) if (PACK.test(f) && !packs.includes(f)) rmSync(join(ctx.out, f));
  writeJson(join(ctx.out, "index.json"), { v: 1, voice: ctx.config.voice, model: ctx.config.model, packs, clips }, 0);

  const bytes = items.reduce((s, it) => s + it.bytes, 0);
  const minutes = items.reduce((s, it) => s + it.ms, 0) / 60000;
  const per = GROUPS.map((g) => `${g} ${packs.filter((p) => p.startsWith(`${g}-`)).length}`).join(", ");
  console.log(`pack: ${items.length} takes, ${Object.keys(clips).length} keys, ${minutes.toFixed(1)} min, ${(bytes / 1e6).toFixed(2)} MB in ${packs.length} packs (${per}) at ${ctx.out}`);
  if (missing.length) console.warn(`pack: ${missing.length} takes not mastered yet, left to speechSynthesis: ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? ", ..." : ""}`);
  return missing.length;
}

if (isMain(import.meta.url)) process.exit((await run(context())) ? 1 : 0);
