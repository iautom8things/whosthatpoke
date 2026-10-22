#!/usr/bin/env node
// Converts a packed voice folder (pack.mjs output) into one MP3 file per take, so the runtime fetches each clip
// on its own and the service worker can cache what a round needs instead of whole packs.
//
//   node scripts/voice/files.mjs <packed-dir> <out-dir> [--clean]
//
// A single-take key becomes <key>.<hash>.mp3 and a multi-take key <key>.<n>.<hash>.mp3, where <hash> is the
// first 8 hex digits of the SHA-1 of the clip's bytes. The service worker caches clips by URL and never asks
// again, so a re-recorded clip must get a new name or a device that saved the old one keeps playing it.
// Each slice is already a whole MP3 (Xing frame kept, no ID3), so the bytes are copied as they are.
// index.json stays format v1 with each take in its own single-clip pack: packs[i] is the file name and a take is
// [i, 0, bytes, ms]. Keys keep their order, takes keep theirs, voice, model and ms carry over.
// Every pack is read before anything is written, so <out-dir> may be <packed-dir>. --clean removes every other
// .mp3 in <out-dir>, the old packs included; index.json is written last, so a failed run leaves the old set whole.
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { isMain, readJson, writeJson } from "./lib/common.mjs";

/** Letters, digits and dashes between single dots: every character is URL-safe and no name starts with a dot. */
const KEY = /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*$/;

/** The file name for take `n` of a key with `count` takes, ending in `tag` (the content hash) when there is one. */
export const takeName = (key, n, count, tag) => [key, ...(count === 1 ? [] : [n]), ...(tag ? [tag] : []), "mp3"].join(".");

/** The first 8 hex digits of the SHA-1 of a clip's bytes. */
export const contentTag = (bytes) => createHash("sha1").update(bytes).digest("hex").slice(0, 8);

/**
 * The per-take files and the new index for a v1 index whose packs are `sizes` bytes long. Each file is
 * `{ name, pack, offset, bytes }`, the byte range it copies. `tag(pack, offset, bytes)` names the content in the
 * file name. Throws on anything the runtime would reject.
 */
export function plan(index, sizes, tag = () => undefined) {
  if (index?.v !== 1 || !Array.isArray(index.packs) || !index.clips || typeof index.clips !== "object") {
    throw new Error("not a v1 voice index");
  }
  const files = [];
  const clips = {};
  // Lowercased, so two names that differ only in case cannot overwrite each other on macOS.
  const owner = new Map();
  for (const [key, takes] of Object.entries(index.clips)) {
    if (!KEY.test(key)) throw new Error(`${key}: a key must be letters, digits and dashes between single dots`);
    if (!Array.isArray(takes) || takes.length === 0) throw new Error(`${key}: no takes`);
    clips[key] = takes.map((take, n) => {
      if (!Array.isArray(take) || take.length !== 4 || !take.every((x) => Number.isInteger(x) && x >= 0)) {
        throw new Error(`${key} take ${n}: not [pack, offset, bytes, ms]`);
      }
      const [pack, offset, bytes, ms] = take;
      if (pack >= index.packs.length || bytes === 0 || offset + bytes > sizes[pack]) {
        throw new Error(`${key} take ${n}: [${take}] is outside ${index.packs[pack] ?? `pack ${pack}`}`);
      }
      const name = takeName(key, n, takes.length, tag(pack, offset, bytes));
      const clash = owner.get(name.toLowerCase());
      if (clash) throw new Error(`${name}: both ${clash} and ${key} want this file`);
      owner.set(name.toLowerCase(), key);
      files.push({ name, pack, offset, bytes });
      return [files.length - 1, 0, bytes, ms];
    });
  }
  return { files, index: { v: 1, voice: index.voice, model: index.model, packs: files.map((f) => f.name), clips } };
}

/** An MPEG audio frame sync, or an ID3 tag in front of one. A wrong offset lands mid-frame and fails this. */
const isMp3 = (b) => (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) || b.toString("latin1", 0, 3) === "ID3";

/** Writes the per-take layout of the packed folder `src` into `out`. Returns what it wrote and removed. */
export function convert(src, out, { clean = false } = {}) {
  const input = readJson(join(src, "index.json"));
  if (!input) throw new Error(`no index.json in ${src}`);
  const packs = (Array.isArray(input.packs) ? input.packs : []).map((name) => readFileSync(join(src, name)));
  const { files, index } = plan(
    input,
    packs.map((b) => b.length),
    (pack, offset, bytes) => contentTag(packs[pack].subarray(offset, offset + bytes)),
  );
  const slices = files.map((f) => {
    const bytes = packs[f.pack].subarray(f.offset, f.offset + f.bytes);
    if (!isMp3(bytes)) throw new Error(`${f.name}: no MP3 frame at byte ${f.offset} of ${input.packs[f.pack]}`);
    return bytes;
  });

  mkdirSync(out, { recursive: true });
  files.forEach((f, i) => {
    writeFileSync(join(out, `${f.name}.tmp`), slices[i]);
    renameSync(join(out, `${f.name}.tmp`), join(out, f.name));
  });
  writeJson(join(out, "index.json"), index, 0);

  const removed = [];
  if (clean) {
    const keep = new Set(index.packs);
    for (const f of readdirSync(out).sort()) {
      if (/\.mp3(\.tmp)?$/.test(f) && !keep.has(f)) {
        rmSync(join(out, f));
        removed.push(f);
      }
    }
  }
  return { takes: files.length, keys: Object.keys(index.clips).length, bytes: files.reduce((s, f) => s + f.bytes, 0), removed };
}

if (isMain(import.meta.url)) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { clean: { type: "boolean" }, help: { type: "boolean" } } });
  if (values.help || positionals.length !== 2) {
    console.error("usage: node scripts/voice/files.mjs <packed-dir> <out-dir> [--clean]");
    process.exit(values.help ? 0 : 2);
  }
  const [src, out] = positionals.map((p) => resolve(p));
  const r = convert(src, out, { clean: values.clean });
  console.log(`files: ${r.takes} takes, ${r.keys} keys, ${(r.bytes / 1e6).toFixed(2)} MB at ${out}${values.clean ? `, ${r.removed.length} old files removed` : ""}`);
}
