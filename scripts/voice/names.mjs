#!/usr/bin/env node
// The pronunciation loop: for every name the selection speaks, find the input text that makes this voice
// say it the way data/phonetics.json (or data/voice/words.json) says it should sound.
//
//   node scripts/voice/names.mjs [--dex 1-151] [--ids 25,pokemon] [--concurrency 8] [--redo]
//
// Each name is first rendered plain, as "It’s <Name>!" with the reveal's own direction, up to judge.takes times.
// Every take is judged twice: gpt-transcribe writes what it hears, and a blind gpt-audio-1.5 listener that
// is never told the name writes back a respelling. A cheap text model compares those with the target IPA
// and respelling and says match, near or wrong. A miss gets a second listen, since the listener wanders
// and a real defect does not. Only a name that is not a match on every take is respelled
// (notes.md: a respelling can add errors). Variants come from the target respelling, the old speechSynthesis
// respelling and an LLM drafting from the IPA and what earlier tries were heard as, all held to the rules in
// lib/text.mjs respellingProblems. Each is rendered and judged the same way and the best wins. A name with no
// all-match variant after judge.rounds rounds goes on the review list.
// Results go to data/voice/names.json under this voice ("model/voice"), with the evidence. The winning take
// becomes the shipped reveal, so the reveal kids hear is the one the listener checked.
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { duration } from "./lib/audio.mjs";
import { context, isMain, manifest, pool, readJson, usd, writeJson } from "./lib/common.mjs";
import { chatJson, listen, meter, transcribe } from "./lib/openai.mjs";
import { job, REVEAL, targets } from "./lib/plan.mjs";
import { respellingProblems, respellToInput, slotIds, slug } from "./lib/text.mjs";
import { renderJob } from "./tts.mjs";

const POINTS = { match: 2, near: 1, wrong: 0 };

// Bump when COMPARE changes: cached takes keep their audio, transcript and listener report, and only the
// verdict is asked again.
const JUDGE_VERSION = 4;

const COMPARE = `You grade how a text-to-speech voice pronounced a name, from two reports on one clip, against the target pronunciation.
The listener heard the clip without being told the name. Trust it for syllables, consonants and vowels, and read its respellings as rough English spellings of sounds:
- Its stress capitals are unreliable, so a difference in stress alone is not an error.
- These spell the same sound: oh, oe, ow and o as in "go"; ay, ai, ey and é as in "day"; oo, ew, u and ue as in "too"; ee, ea and y as in "see"; air, are and er before r as in "care"; gh, g and gu for a hard g unless written j; c, k and ck; s and z at the end of a word.
- A respelling cannot show what every English speaker does anyway: n before g or k is the ng sound (GEN-gar is GHENG-gar), t between vowels may come out as a quick d, and unstressed vowels blur to uh, ih or ah.
The transcript comes from speech recognition that leans toward real spellings. A transcript showing the official spelling proves little. One showing other real words (such as "Grand Ninja", "ESPN", "manicure") is strong evidence of a wrong reading, unless those words make the same sounds as the target.
Verdicts:
- match: the same syllables, consonants and stressed vowels as the target, allowing for all of the above. A fan would say the name was said right.
- near: clearly the name, but one sound really differs: another vowel in a stressed syllable (GAR for GARE, KWAH for KWAY), a syllable dropped or added, or one consonant changed (D for G, J for a hard G).
- wrong: two or more real differences, letters spelled out one by one, extra or missing words, or a different word.
The reason names the sound that differs, in at most 20 words.`;

const DRAFT = `You write respellings that make an English text-to-speech voice say an invented name right. The respelling replaces the name in the sentence "It’s ___!", and the voice reads it as ordinary English.
Rules that tested well with this voice:
- Hyphen-joined chunks of everyday English: Gare-uh-dose, Ray-kway-zuh, Mimmy-cue, Poh-kay-mon. Real words and common syllables (dose, cue, kway, ray, gar) read more reliably than invented spellings.
- Capitalize the first letter of each word like a name; everything else lowercase. Never use capitals to show stress.
- Never use a chunk that is a letter's name, which the voice may spell out: ar, es, oh, ee, jee, em, en, el, ex, ef. Put such sounds inside a bigger chunk (Gar, Char, Poh, doh, Nee).
- Get the stress from the chunks: a full, strong vowel in the stressed syllable, "uh" only where the target has a schwa. Fewer, longer chunks often hold the stress better than many short ones.
- Only letters, hyphens, and a space between the words of a multi-word name. No IPA, accents, digits or other punctuation.
- Keep every sound of the target and add none.
You see what earlier tries were heard as. Fix the sound that went wrong, and never repeat a spelling already tried.
Return exactly the number of respellings asked for, best first, each with a short reason.`;

const VERDICT = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "reason"],
  properties: { verdict: { type: "string", enum: ["match", "near", "wrong"] }, reason: { type: "string" } },
};
const VARIANTS = {
  type: "object",
  additionalProperties: false,
  required: ["variants"],
  properties: {
    variants: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["text", "why"], properties: { text: { type: "string" }, why: { type: "string" } } },
    },
  },
};

const sounds = (s) => (s ?? "").toLowerCase().replace(/[^a-z]/g, "");

async function compare(ctx, t, transcript, heard) {
  // The blind listener wrote the target respelling itself: nothing left to compare.
  if (heard.respelling && sounds(heard.respelling) === sounds(t.respell) && !heard.spelled_out) {
    return { verdict: "match", reason: "the blind listener wrote the target respelling" };
  }
  return chatJson({
    model: ctx.config.judge.comparator,
    effort: ctx.config.judge.compareEffort,
    system: COMPARE,
    name: "verdict",
    schema: VERDICT,
    step: "names",
    user: {
      name: t.name,
      target: { ipa: t.ipa, respelling: t.respell, notes: t.notes || undefined },
      phrase: REVEAL.replace("{id}", "___"),
      listener: heard.respelling
        ? { phrase: heard.heard, respelling: heard.respelling, ipa: heard.ipa, spelled_out: heard.spelled_out, extra: heard.extra }
        : "the listener gave no answer; judge from the transcript alone",
      transcript,
    },
  });
}

const RANK = { wrong: 0, near: 1, match: 2 };
const report = (h) => ({ heard: h.respelling ?? null, ipa: h.ipa ?? null, phrase: h.heard ?? h.raw ?? null, spelledOut: Boolean(h.spelled_out), extra: h.extra ?? "" });
const asHeard = (r) => ({ respelling: r.heard, ipa: r.ipa, heard: r.phrase, spelled_out: r.spelledOut, extra: r.extra });

/**
 * Renders (if needed) and judges one take, caching the result next to the clip so a rerun is free. A miss
 * must be heard twice: the listener's answers wander from call to call on a clean clip, while a real defect
 * in the audio is heard again. So a take that is not a match gets a second, independent listen, and the
 * better of the two verdicts stands.
 */
async function judgeTake(ctx, t, j, file) {
  const sidecar = file.replace(/\.wav$/, ".json");
  let rec = readJson(sidecar);
  if (rec?.v === JUDGE_VERSION) return rec;
  const { judge } = ctx.config;
  if (!rec) {
    const fresh = !existsSync(file);
    if (fresh) await renderJob(j, file);
    const seconds = await duration(file);
    if (fresh) meter.speech("names", j, seconds);
    const [transcript, heard] = await Promise.all([
      transcribe(file, { model: judge.transcribe, seconds, step: "names" }),
      listen(file, { model: judge.listener, step: "names" }),
    ]);
    rec = { file: relative(ctx.work, file), seconds: Number(seconds.toFixed(2)), transcript, ...report(heard) };
  }
  const v = await compare(ctx, t, rec.transcript, asHeard(rec));
  rec = { ...rec, v: JUDGE_VERSION, verdict: v.verdict, reason: v.reason };
  if (v.verdict !== "match") {
    const again = rec.second ?? report(await listen(file, { model: judge.listener, step: "names" }));
    const v2 = await compare(ctx, t, rec.transcript, asHeard(again));
    rec.second = { ...again, verdict: v2.verdict, reason: v2.reason };
    if (RANK[v2.verdict] > RANK[v.verdict]) Object.assign(rec, { verdict: v2.verdict, reason: `on a second listen: ${v2.reason}` });
  }
  writeJson(sidecar, rec);
  return rec;
}

/**
 * Renders and judges `input` up to judge.takes times. The voice varies from take to take, so a candidate is
 * a match only when every take is, and the takes stop at the first that is not. Score is the mean points
 * per judged take, which ranks candidates when none is a match.
 */
async function evaluate(ctx, t, input) {
  const j = job(ctx, "name", { input: REVEAL.replace("{id}", input), kind: "reveal" });
  const dir = join(ctx.work, "names", ctx.fpSlug, t.id);
  const takes = [];
  for (let k = 0; k < ctx.config.judge.takes; k++) {
    const take = await judgeTake(ctx, t, j, join(dir, `${slug(input) || "x"}~${j.hash}-${k + 1}.wav`));
    takes.push(take);
    if (take.verdict !== "match") break;
  }
  const score = takes.reduce((s, tk) => s + POINTS[tk.verdict], 0) / takes.length;
  const all = takes.length === ctx.config.judge.takes;
  const verdict = all && score === 2 ? "match" : score >= 1 ? "near" : "wrong";
  return { input, verdict, score, hash: j.hash, takes };
}

async function draft(ctx, t, tried, want) {
  const out = await chatJson({
    model: ctx.config.judge.drafter,
    system: DRAFT,
    name: "respellings",
    schema: VARIANTS,
    effort: "medium",
    step: "names",
    user: {
      name: t.name,
      target: { ipa: t.ipa, respelling_stress_in_caps: t.respell, notes: t.notes || undefined },
      tried: tried.map((c) => ({ input: c.input, verdict: c.verdict, heard_as: c.takes.map((tk) => tk.heard ?? tk.transcript), why: c.takes.map((tk) => tk.reason) })),
      respellings_wanted: want,
    },
  });
  return out.variants ?? [];
}

/** Plain first; respell only on a miss; keep the best. */
async function settle(ctx, t) {
  const { judge } = ctx.config;
  const plain = await evaluate(ctx, t, t.plain);
  const tried = [{ ...plain, source: "plain" }];
  let best = plain;
  if (plain.verdict !== "match") {
    const seen = new Set([t.plain.toLowerCase()]);
    const queue = [];
    const offer = (text, src, why) => {
      const clean = text?.trim();
      if (!clean || seen.has(clean.toLowerCase()) || respellingProblems(clean).length) return;
      seen.add(clean.toLowerCase());
      queue.push({ text: clean, source: src, why });
    };
    if (t.respell) offer(respellToInput(t.respell), "target");
    if (t.current) offer(t.current, "old");
    for (let round = 0; round < judge.rounds && best.verdict !== "match"; round++) {
      const want = judge.variants - queue.length;
      if (want > 0) for (const v of await draft(ctx, t, tried, want + 1)) offer(v.text, "drafted", v.why);
      for (const cand of queue.splice(0, judge.variants)) {
        const r = await evaluate(ctx, t, cand.text);
        tried.push({ ...r, source: cand.source, why: cand.why });
        if (r.score > best.score) best = r;
        if (r.verdict === "match") break;
      }
    }
  }
  const take = best.takes.find((tk) => tk.verdict === "match") ?? best.takes.toSorted((a, b) => POINTS[b.verdict] - POINTS[a.verdict])[0];
  return {
    name: t.name,
    status: plain.verdict === "match" ? "plain" : best.verdict === "match" ? "respelled" : "review",
    input: best.input,
    verdict: best.verdict,
    target: { ipa: t.ipa, respell: t.respell },
    plain: { verdict: plain.verdict, heard: plain.takes.map((tk) => tk.heard) },
    tried: tried.map((c) => ({
      input: c.input,
      source: c.source,
      ...(c.why ? { why: c.why } : {}),
      verdict: c.verdict,
      takes: c.takes.map((tk) => ({
        heard: tk.heard,
        ...(tk.second ? { heardAgain: tk.second.heard } : {}),
        transcript: tk.transcript,
        verdict: tk.verdict,
        reason: tk.reason,
        file: tk.file,
      })),
    })),
    take: { file: take.file, hash: best.hash },
    at: new Date().toISOString(),
  };
}

/** Slot ids the selection speaks, or --ids. */
export function neededIds(ctx) {
  if (ctx.args.ids) return ctx.args.ids.split(",").map((s) => s.trim());
  const ids = new Set();
  for (const e of manifest(ctx)) for (const id of slotIds(e.template)) ids.add(id);
  return [...ids].sort((a, b) => (Number(a) || 1e9) - (Number(b) || 1e9) || a.localeCompare(b));
}

export async function run(ctx) {
  const tg = targets(ctx);
  const store = readJson(ctx.namesPath, {});
  const book = (store[ctx.fp] ??= {});
  const ids = neededIds(ctx);
  const missing = ids.filter((id) => !tg.has(id));
  if (missing.length) throw new Error(`no pronunciation target for ${missing.join(", ")}`);
  // A hand-set ("manual") name is never re-decided, not even by --redo.
  const todo = ids.filter((id) => book[id]?.status !== "manual" && (ctx.args.redo || !book[id]?.status));
  console.log(`names: ${ids.length} needed under ${ctx.fp}, ${ids.length - todo.length} already settled, ${todo.length} to judge`);
  const start = meter.total;
  let done = 0;
  const tally = () => Object.entries(Object.groupBy(ids.map((id) => book[id]?.status ?? "pending"), (s) => s)).map(([s, v]) => `${s} ${v.length}`);
  const failed = await pool(
    todo,
    ctx.concurrency,
    async (id) => {
      book[id] = await settle(ctx, tg.get(id));
      writeJson(ctx.namesPath, store);
      done++;
      const spent = meter.total - start;
      const r = book[id];
      console.log(
        `  ${String(done).padStart(4)}/${todo.length} ${r.name.padEnd(14)} ${r.status.padEnd(9)} "${r.input}"  · ${tally().join(", ")} · ${usd(spent)} spent, ~${usd((spent / done) * todo.length)} for this run`,
      );
    },
    "names ",
  );
  const why = (r) => r.tried.find((c) => c.input === r.input)?.takes.map((tk) => tk.reason).join(" / ");
  const review = ids.filter((id) => book[id]?.status === "review").map((id) => `${book[id].name} as "${book[id].input}": ${why(book[id])}`);
  console.log(`names: ${tally().join(", ")}; ${usd(meter.total - start)} this run`);
  if (review.length) console.log(`names to review by ear:\n  ${review.join("\n  ")}`);
  return failed;
}

if (isMain(import.meta.url)) {
  const ctx = context();
  meter.configure(join(ctx.work, "cost.jsonl"), ctx.config.prices);
  process.exit((await run(ctx)) ? 1 : 0);
}
