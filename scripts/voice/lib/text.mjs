// Pure text helpers for the voice pipeline: keys, templates, respellings and the QA word match.
// Nothing here touches the network or the disk, so it is all unit tested (text.test.mjs).

/** 32-bit FNV-1a over UTF-8, as 8 hex digits (src/audio/lines.ts has the same). */
export function fnv1a(text) {
  let h = 0x811c9dc5;
  for (const b of Buffer.from(text, "utf8")) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h.toString(16).padStart(8, "0");
}

const fold = (s) => s.normalize("NFKD").replace(/\p{M}/gu, "");

/**
 * Clip-key slug, as build-runtime/contract.md pins it: NFKD, accents stripped, lowercase, each run of other
 * characters becomes "-". Over 60 characters it keeps the first 50 and appends the FNV-1a of the full slug.
 * Only U+0300 to U+036F go, like src/audio/lines.ts: an emoji's variation selector (U+FE0F) is a mark too,
 * and it must turn into a "-" here as it does in the game.
 */
export function slug(text) {
  const s = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.length > 60 ? `${s.slice(0, 50).replace(/-+$/, "")}-${fnv1a(s)}` : s;
}

/** The game's results-screen spoken() (src/ui/screens/results/model.ts), kept in step by hand. */
export function spoken(text) {
  return text
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s*\+\s*/g, " and ")
    .replace(/\b[A-Z]{3,}\b/g, (w) => w.toLowerCase())
    .replace(/\s+/g, " ")
    .trim();
}

/** Capitalizes the first letter of every sentence. */
export const sentenceCase = (text) => text.replace(/(^|[.!?]\s+)(\p{Ll})/gu, (_, p, c) => p + c.toUpperCase());

const SLOT = /\{([a-z0-9-]+)\}/g;

/** Slot ids in a template, in order of first appearance. Species slots are dex numbers. */
export const slotIds = (template) => [...new Set([...template.matchAll(SLOT)].map((m) => m[1]))];

/** Fills `{id}` slots from `inputs`; a missing id throws so nothing renders with a hole in it. */
export function fill(template, inputs) {
  return template.replace(SLOT, (_, id) => {
    const v = inputs[id];
    if (v === undefined) throw new Error(`no text for slot {${id}} in "${template}"`);
    return v;
  });
}

/** The name as the voice should read it when it reads it plain: the ♀/♂ signs are silent. */
export const plainName = (name) => name.replace(/[♀♂]/g, "").replace(/\s+/g, " ").trim();

/** "ray-KWAY-zuh" to "Ray-kway-zuh": stress caps dropped, each word capitalized like a name. */
export const respellToInput = (respell) =>
  respell
    .trim()
    .split(/\s+/)
    .map((w) => w.toLowerCase().replace(/^[a-z]/, (c) => c.toUpperCase()))
    .join(" ");

// Chunks the voice may read as spelled-out letters (notes.md section 2). "kay" and "cue" are safe
// because they carry the sound they spell.
const LETTER_CHUNKS = new Set(["ar", "es", "ess", "oh", "ee", "jee", "gee", "em", "en", "el", "ex", "ef", "eff", "aitch"]);

/** Why a respelling breaks the rules in notes.md, or [] when it is fine. */
export function respellingProblems(text) {
  const problems = [];
  if (!text || !text.trim()) return ["empty"];
  if (/[^A-Za-z\- ]/.test(text)) problems.push("only letters, hyphens and spaces");
  for (const word of text.trim().split(/\s+/)) {
    if (!/^[A-Z][a-z]*(-[a-z]+)*$/.test(word)) problems.push(`"${word}": capitalize the word once, the rest lowercase`);
    for (const chunk of word.toLowerCase().split("-")) {
      if (LETTER_CHUNKS.has(chunk)) problems.push(`"${chunk}" reads as a letter name`);
      if (/^uh[a-z]/.test(chunk)) problems.push(`"${chunk}": give the "uh" its own chunk`);
      if (/hh|(.)\1\1/.test(chunk)) problems.push(`"${chunk}": no tripled letters or "hh"`);
    }
  }
  return problems;
}

const ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split(" ");
const TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split(" ");

/** 0 to 9999 in words, the way an announcer reads a score. */
export function numberWords(n) {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : "");
  if (n < 1000) return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` ${numberWords(n % 100)}` : ""}`;
  return `${numberWords(Math.floor(n / 1000))} thousand${n % 1000 ? ` ${numberWords(n % 1000)}` : ""}`;
}

const ALIASES = { mr: "mister", jr: "junior", ok: "okay" };

/** Lowercase words with accents, apostrophes and punctuation gone and digits spelled out. */
export function words(text) {
  return fold(text)
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/\d+/g, (n) => ` ${numberWords(Number(n))} `)
    .replace(/[^a-z]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => ALIASES[w] ?? w);
}

/** Rough English syllable count, enough to predict how long a line should run. */
export function syllables(text) {
  let n = 0;
  for (const w of words(text)) {
    const groups = w.match(/[aeiouy]+/g)?.length ?? 0;
    // A lone final e after a consonant is silent ("mime", "dose"); "ee" and "le" are not ("Eevee", "Lapras").
    const silentE = /[^aeiouy]e$/.test(w) && !w.endsWith("le") && groups > 1 ? 1 : 0;
    n += Math.max(1, groups - silentE);
  }
  return n;
}

/**
 * Expected words for a template: literal words are hard, the words of a filled slot are soft, since
 * QA only flags names for a listen and never fails them (plan.md section 8, step 7). A possessive "'s"
 * after a slot joins the name ("Gengar's" is transcribed as one word).
 */
export function expectedWords(template, names) {
  const out = [];
  let last = 0;
  for (const m of template.matchAll(SLOT)) {
    for (const w of words(template.slice(last, m.index))) out.push({ w, slot: null });
    const name = words(names[m[1]] ?? m[1]);
    last = m.index + m[0].length;
    if (/^['’]s(?![a-z])/i.test(template.slice(last))) {
      name[name.length - 1] += "s";
      last += 2;
    }
    for (const w of name) out.push({ w, slot: m[1] });
  }
  for (const w of words(template.slice(last))) out.push({ w, slot: null });
  return out;
}

/**
 * Aligns heard words to expected ones. Hard words cost 1 to miss, swap or add; slot words and anything
 * heard inside or next to a slot cost nothing. A hard word fused into the next or previous name by the
 * recognizer ("or Gyarados" as "orgera does") still counts as said. Returns the hard edits and what was
 * heard in each slot.
 */
export function alignWords(expected, heard) {
  const n = expected.length;
  const m = heard.length;
  const free = (i) => (i > 0 && expected[i - 1].slot) || (i < n && expected[i].slot);
  // The slot a hard word expected[i - 1] was fused into, when heard as `h`.
  const fused = (i, h) => {
    const e = expected[i - 1];
    if (e.slot || h.length <= e.w.length) return null;
    if (expected[i]?.slot && h.startsWith(e.w)) return expected[i].slot;
    if (expected[i - 2]?.slot && h.endsWith(e.w)) return expected[i - 2].slot;
    return null;
  };
  const sub = (i, j) => (expected[i - 1].w === heard[j - 1] || expected[i - 1].slot || fused(i, heard[j - 1]) ? 0 : 1);
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) dp[i][0] = dp[i - 1][0] + (expected[i - 1].slot ? 0 : 1);
  for (let j = 1; j <= m; j++) dp[0][j] = dp[0][j - 1] + (free(0) ? 0 : 1);
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const e = expected[i - 1];
      dp[i][j] = Math.min(dp[i - 1][j - 1] + sub(i, j), dp[i - 1][j] + (e.slot ? 0 : 1), dp[i][j - 1] + (free(i) ? 0 : 1));
    }
  }
  const edits = [];
  const slots = {};
  const hear = (slot, w) => (slots[slot] = slots[slot] ? `${slots[slot]} ${w}` : w);
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const e = expected[i - 1];
    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + sub(i, j)) {
      const h = heard[j - 1];
      if (e.slot) hear(e.slot, h);
      else if (e.w !== h && fused(i, h)) hear(fused(i, h), h);
      else if (e.w !== h) edits.unshift(`"${e.w}" heard as "${h}"`);
      i--;
      j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + (e.slot ? 0 : 1)) {
      if (!e.slot) edits.unshift(`missing "${e.w}"`);
      i--;
    } else {
      const near = (i > 0 && expected[i - 1].slot) || (i < n && expected[i].slot);
      if (near) hear(near, heard[j - 1]);
      else edits.unshift(`extra "${heard[j - 1]}"`);
      j--;
    }
  }
  // Backtracking walks right to left, so each slot's words came out reversed.
  for (const k of Object.keys(slots)) slots[k] = slots[k].split(" ").reverse().join(" ");
  return { edits, slots };
}

function levenshtein(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** 0 to 1 letter similarity, spaces and punctuation ignored. */
export function similarity(a, b) {
  const x = words(a).join("");
  const y = words(b).join("");
  if (!x && !y) return 1;
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
}

/**
 * Picks the three comma pauses in a choices carrier. `silences` are [{ start, end }] in seconds,
 * `total` the clip length and `weights` the syllables of the four parts. Long pauses near where the
 * syllable count puts each comma win. Returns three cut times (pause midpoints) or null.
 */
export function chooseCuts(silences, total, weights) {
  const inner = silences.filter((s) => s.start > 0.05 && s.end < total - 0.05);
  if (inner.length < 3) return null;
  const sum = weights.reduce((a, b) => a + b, 0);
  const lead = silences.find((s) => s.start <= 0.05)?.end ?? 0;
  const tail = silences.find((s) => s.end >= total - 0.05)?.start ?? total;
  const speech = Math.max(0.1, tail - lead);
  const expect = [1, 2, 3].map((k) => lead + (speech * weights.slice(0, k).reduce((a, b) => a + b, 0)) / sum);
  let best = null;
  for (let a = 0; a < inner.length; a++) {
    for (let b = a + 1; b < inner.length; b++) {
      for (let c = b + 1; c < inner.length; c++) {
        const picks = [inner[a], inner[b], inner[c]];
        const score = picks.reduce((s, p, k) => {
          const mid = (p.start + p.end) / 2;
          return s + Math.min(p.end - p.start, 0.5) / 0.5 - (2 * Math.abs(mid - expect[k])) / speech;
        }, 0);
        if (!best || score > best.score) best = { score, cuts: picks.map((p) => (p.start + p.end) / 2) };
      }
    }
  }
  return best.cuts;
}

/** Deterministic Fisher-Yates (mulberry32), so the choice carriers are stable between runs. */
export function shuffle(items, seed) {
  let t = seed >>> 0;
  const rand = () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Fills packs of at most `maxBytes` in order, never splitting an item; an oversized item gets a pack alone. */
export function fillPacks(items, maxBytes) {
  const packs = [];
  let cur = null;
  for (const item of items) {
    if (!cur || (cur.bytes + item.bytes > maxBytes && cur.items.length > 0)) packs.push((cur = { bytes: 0, items: [] }));
    cur.items.push(item);
    cur.bytes += item.bytes;
  }
  return packs;
}
