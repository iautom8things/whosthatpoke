// The recording plan: every take the selection needs, what it says, and where its audio comes from.
// Every step rebuilds the same plan from the manifest, names.json, the config and retakes.json, so the
// steps share no hidden state and a rerun picks up exactly where the last one stopped.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { manifest, readJson, ROOT, sha } from "./common.mjs";
import { fill, plainName, shuffle, slotIds, syllables } from "./text.mjs";

export const REVEAL = "It’s {id}!";

export const directionKind = (kind) => (kind.startsWith("choice") ? "choices" : kind);
export const groupOf = (kind) => (kind === "reveal" || kind === "fact" ? kind : kind.startsWith("choice") ? "choice" : "core");

/** Base instructions, then the kind's direction, then any line-level notes. */
export const instructionsFor = (config, kind, ...extra) =>
  [config.instructions, config.direction?.[directionKind(kind)], ...extra].filter(Boolean).join("\n");

/** A tts.mjs job. Its id and file carry a hash of everything that changes the audio, so edits re-render. */
export function job(ctx, name, { input, kind, extra = [], nonce = 0, dir = "raw" }) {
  const { model, voice, speed } = ctx.config;
  const instructions = instructionsFor(ctx.config, kind, ...extra);
  const hash = sha([model, voice, instructions, input, speed ?? 1, nonce]).slice(0, 10);
  const id = `${name}~${hash}`;
  return { id, model, voice, input, instructions, ...(speed && speed !== 1 ? { speed } : {}), hash, file: join(ctx.work, dir, `${id}.wav`) };
}

/** Pronunciation targets by slot id: species from data/phonetics.json, other words from data/voice/words.json. */
export function targets(ctx) {
  const out = new Map();
  for (const p of readJson(join(ROOT, "data/phonetics.json"))) {
    out.set(String(p.dex), { id: String(p.dex), name: p.name, plain: plainName(p.name), ipa: p.ipa, respell: p.respell, current: p.current, notes: p.notes ?? "" });
  }
  for (const w of readJson(ctx.wordsPath, [])) out.set(w.id, { ...w, name: w.text, plain: w.text, current: null });
  return out;
}

/** This voice's page of data/voice/names.json. */
export const namesBook = (ctx) => readJson(ctx.namesPath, {})[ctx.fp] ?? {};

export const retakesPath = (ctx) => join(ctx.work, "retakes.json");
export const retakes = (ctx) => readJson(retakesPath(ctx), {})[ctx.fp] ?? {};

export function buildPlan(ctx) {
  const entries = manifest(ctx);
  const tg = targets(ctx);
  const book = namesBook(ctx);
  const again = retakes(ctx);
  const unjudged = new Set();
  const said = (id) => {
    if (book[id]?.input) return book[id].input;
    if (!tg.has(id)) throw new Error(`no pronunciation target for slot {${id}}`);
    unjudged.add(id);
    return tg.get(id).plain;
  };
  const inputs = (template) => Object.fromEntries(slotIds(template).map((id) => [id, said(id)]));
  const official = (template) => Object.fromEntries(slotIds(template).map((id) => [id, tg.get(id)?.plain ?? id]));

  const clips = [];
  const choiceDex = [];
  for (const e of entries) {
    const base = { key: e.key, kind: e.kind, group: groupOf(e.kind), text: e.text, template: e.template, dex: e.dex, official: official(e.template) };
    if (e.kind.startsWith("choice")) {
      const pos = e.kind.slice("choice-".length);
      if (pos === "first") choiceDex.push(e.dex);
      const nonce = again[e.key] ?? 0;
      const single = job(ctx, `single.${e.key}`, { input: fill(e.template, inputs(e.template)), kind: e.kind, extra: [ctx.config.positions[pos]], nonce });
      clips.push({ ...base, id: e.key, take: "", pos, input: single.input, single, nonce });
      continue;
    }
    for (const v of e.variants ?? [{ id: "" }]) {
      const id = v.id ? `${e.key}.${v.id}` : e.key;
      const nonce = again[id] ?? 0;
      const input = fill(e.template, inputs(e.template));
      const j = job(ctx, id, { input, kind: e.kind, extra: [e.direction, v.direction], nonce });
      let raw = j.file;
      // A reveal reuses the take names.mjs judged, when it is the very same job.
      const take = e.kind === "reveal" ? book[e.dex]?.take : null;
      if (take && !nonce && take.hash === j.hash && existsSync(join(ctx.work, take.file))) raw = join(ctx.work, take.file);
      clips.push({ ...base, id, take: v.id, input, job: raw === j.file ? j : null, raw });
    }
  }

  // Choice carriers (plan.md section 3): carrier i reads o[i..i+3] of a fixed shuffle, so every name lands
  // in every slot once. Slot 1 gives the main mid take and slot 2 a spare.
  const order = shuffle([...new Set(choiceDex)].sort((a, b) => a - b), ctx.config.choices.seed);
  const carriers = [];
  const slotOf = new Map();
  if (order.length >= 4) {
    order.forEach((_, i) => {
      const dex = [0, 1, 2, 3].map((k) => order[(i + k) % order.length]);
      const template = `Is it {${dex[0]}}, {${dex[1]}}, {${dex[2]}}, or {${dex[3]}}?`;
      const input = fill(template, inputs(template));
      const parts = [`Is it ${said(String(dex[0]))}`, said(String(dex[1])), said(String(dex[2])), `or ${said(String(dex[3]))}`];
      const name = `carrier.${dex.join("-")}`;
      const attempt = (n) => job(ctx, name, { input, kind: "choice-mid", nonce: n });
      carriers.push({ name, dex, input, weights: parts.map(syllables), attempt, result: join(ctx.work, "slices", `${attempt(0).id}.json`) });
      dex.forEach((d, slot) => slotOf.set(`${d}:${slot}`, i));
    });
  }
  for (const c of clips) {
    if (!c.pos) continue;
    const at = (slot) => (slotOf.has(`${c.dex}:${slot}`) ? { carrier: slotOf.get(`${c.dex}:${slot}`), slot } : null);
    c.primary = at(c.pos === "first" ? 0 : c.pos === "mid" ? 1 : 3);
    c.spare = c.pos === "mid" ? at(2) : null;
  }
  return { clips, carriers, unjudged: [...unjudged] };
}

/**
 * Where a take's raw audio is: { file, cuts? } for a slice, { file, single } for a single render. A choice
 * take tries its carrier slice, then (mid only) the spare slice, then a single render; a retake skips ahead
 * along that list.
 */
export function source(plan, clip) {
  if (!clip.pos) return { file: clip.raw };
  const slice = (ref) => {
    if (!ref) return null;
    const c = plan.carriers[ref.carrier];
    const r = readJson(c.result);
    return r?.ok ? { file: r.slices[ref.slot], cuts: r.cuts } : null;
  };
  const tries = clip.nonce === 0 ? [clip.primary, clip.spare] : clip.nonce === 1 && clip.pos === "mid" ? [clip.spare] : [];
  for (const ref of tries) {
    const s = slice(ref);
    if (s) return s;
  }
  return { file: clip.single.file, single: clip.single };
}

/** Whether a carrier result decided against this clip's slot, so it needs its single render now. */
export function needsSingle(plan, clip) {
  const s = source(plan, clip);
  if (!s.single) return false;
  const refs = clip.nonce === 0 ? [clip.primary, clip.spare] : clip.nonce === 1 && clip.pos === "mid" ? [clip.spare] : [];
  // Wait for every carrier the clip could still come from.
  return refs.every((ref) => !ref || existsSync(plan.carriers[ref.carrier].result));
}
