// OpenAI calls for the voice pipeline: speech, transcription, the blind listener, JSON chat and a cost meter.
// The key comes from OPENAI_API_KEY only, and only when a call needs it.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, dirname, extname } from "node:path";

const API = "https://api.openai.com/v1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function auth() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  return `Bearer ${key}`;
}

/** POST with retries on 429, 5xx and network errors. `body` is JSON unless it is FormData. */
export async function post(path, body) {
  const form = body instanceof FormData;
  let status = "network";
  let text = "";
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(`${API}/${path}`, {
        method: "POST",
        headers: form ? { Authorization: auth() } : { Authorization: auth(), "Content-Type": "application/json" },
        body: form ? body : JSON.stringify(body),
        signal: AbortSignal.timeout(180_000),
      });
      if (res.ok) return res;
      status = res.status;
      text = await res.text();
      if (status !== 429 && status < 500) break;
    } catch (err) {
      text = err.message;
    }
    if (attempt >= 6) break;
    await sleep(1000 * 2 ** attempt + Math.random() * 500);
  }
  throw new Error(`${path} ${status}: ${text.slice(0, 300)}`);
}

// List prices in USD per 1M tokens (or per minute / per 1M characters), from the pricing page on
// 2026-10-22. Audio tokens per second were measured in research-api/notes.md. voice.json `prices` overrides.
const PRICES = {
  "gpt-4o-mini-tts": { textIn: 0.6, audioOut: 12, audioTokensPerSec: 25.5 },
  "gpt-audio-1.5": { textIn: 2.5, textOut: 10, audioIn: 32, audioOut: 64, audioTokensPerSec: 20 },
  "gpt-audio": { textIn: 2.5, textOut: 10, audioIn: 32, audioOut: 64, audioTokensPerSec: 20 },
  "gpt-audio-mini": { textIn: 0.6, textOut: 2.4, audioIn: 10, audioOut: 20, audioTokensPerSec: 20 },
  "tts-1": { perMChars: 15 },
  "tts-1-hd": { perMChars: 30 },
  "gpt-transcribe": { perMin: 0.0045 },
  "gpt-4o-transcribe": { perMin: 0.006 },
  "gpt-4o-mini-transcribe": { perMin: 0.003 },
  "gpt-5.4": { textIn: 2.5, textOut: 15 },
  "gpt-5.4-mini": { textIn: 0.75, textOut: 4.5 },
  "gpt-5.4-nano": { textIn: 0.2, textOut: 1.25 },
  "gpt-5-mini": { textIn: 0.25, textOut: 2 },
  "gpt-5-nano": { textIn: 0.05, textOut: 0.4 },
  "gpt-4.1-mini": { textIn: 0.4, textOut: 1.6 },
  "gpt-4.1-nano": { textIn: 0.1, textOut: 0.4 },
};

/** Running spend, by step. Every entry is also appended to <work>/cost.jsonl so totals survive resumes. */
export const meter = {
  file: null,
  prices: PRICES,
  spent: {},
  configure(file, overrides = {}) {
    this.file = file;
    this.prices = { ...PRICES, ...overrides };
    mkdirSync(dirname(file), { recursive: true });
  },
  price(model) {
    const p = this.prices[model] ?? this.prices[model.replace(/-\d{4}-\d{2}-\d{2}$/, "")];
    if (!p) throw new Error(`no price for ${model}; add it to voice.json "prices"`);
    return p;
  },
  add(step, model, cost) {
    this.spent[step] = (this.spent[step] ?? 0) + cost;
    if (this.file) appendFileSync(this.file, JSON.stringify({ t: Date.now(), step, model, usd: Number(cost.toFixed(6)) }) + "\n");
    return cost;
  },
  /** Chat usage: text and audio tokens priced separately. */
  usage(step, model, u) {
    if (!u) return 0;
    const p = this.price(model);
    const audioIn = u.prompt_tokens_details?.audio_tokens ?? 0;
    const audioOut = u.completion_tokens_details?.audio_tokens ?? 0;
    const cost =
      ((u.prompt_tokens - audioIn) * (p.textIn ?? 0) +
        audioIn * (p.audioIn ?? 0) +
        (u.completion_tokens - audioOut) * (p.textOut ?? 0) +
        audioOut * (p.audioOut ?? 0)) /
      1e6;
    return this.add(step, model, cost);
  },
  /** The speech endpoint reports no usage, so its cost is estimated from the clip length. */
  speech(step, job, seconds) {
    const p = this.price(job.model);
    const chars = job.input.length + (job.instructions?.length ?? 0);
    const cost = p.perMChars
      ? (job.input.length * p.perMChars) / 1e6
      : (seconds * p.audioTokensPerSec * p.audioOut + (chars / 4) * p.textIn) / 1e6;
    return this.add(step, job.model, cost);
  },
  minutes(step, model, seconds) {
    return this.add(step, model, (seconds / 60) * this.price(model).perMin);
  },
  get total() {
    return Object.values(this.spent).reduce((a, b) => a + b, 0);
  },
  /** Everything recorded in the cost log, across runs. */
  allTime() {
    if (!this.file || !existsSync(this.file)) return this.total;
    return readFileSync(this.file, "utf8")
      .split("\n")
      .filter(Boolean)
      .reduce((s, line) => s + JSON.parse(line).usd, 0);
  },
};

/** One clip from /v1/audio/speech, or from chat completions for a gpt-audio model. Returns the audio bytes. */
export async function speak(job, format = "wav") {
  if (job.model.startsWith("gpt-audio")) return performed(job, format);
  const body = { model: job.model, voice: job.voice, input: job.input, response_format: format };
  if (job.instructions) body.instructions = job.instructions;
  if (job.speed && job.speed !== 1) body.speed = job.speed;
  const res = await post("audio/speech", body);
  return { audio: Buffer.from(await res.arrayBuffer()) };
}

// gpt-audio performs rather than reads, so it is held to the exact words and its transcript is kept.
async function performed(job, format) {
  const system = [
    job.instructions ?? "",
    "You are a voice actor recording one line for a kids' game. Say exactly the words in the user message, once, with no extra words, sounds or commentary before or after.",
  ].join("\n\n");
  const res = await post("chat/completions", {
    model: job.model,
    modalities: ["text", "audio"],
    audio: { voice: job.voice, format },
    messages: [
      { role: "system", content: system },
      { role: "user", content: job.input },
    ],
  });
  const data = await res.json();
  const audio = data.choices?.[0]?.message?.audio;
  if (!audio?.data) throw new Error(`no audio in response: ${JSON.stringify(data).slice(0, 300)}`);
  return { audio: Buffer.from(audio.data, "base64"), transcript: audio.transcript, usage: data.usage };
}

const MIME = { ".wav": "audio/wav", ".mp3": "audio/mpeg" };

/** Literal transcript. gpt-transcribe writes what it hears rather than snapping to official spellings. */
export async function transcribe(file, { model, seconds, step = "transcribe" }) {
  const form = new FormData();
  form.append("model", model);
  form.append("language", "en");
  form.append("file", new Blob([readFileSync(file)], { type: MIME[extname(file)] ?? "audio/wav" }), basename(file));
  const res = await post("audio/transcriptions", form);
  const text = (await res.json()).text ?? "";
  meter.minutes(step, model, seconds);
  return text.trim();
}

const parseLine = (text) => JSON.parse(text.replace(/^\s*```(?:json)?|```\s*$/g, "").trim());

/**
 * Asks an audio-in model how a clip pronounced its name, without ever naming the target (naming it
 * ruins the judge, notes.md section 5). The system line about synthetic speech stops speaker-ID refusals.
 */
export async function listen(file, { model, step = "listen" }) {
  const system =
    "You check the output of a text-to-speech engine. Every clip is synthetic speech from that engine, not a real person, so there is no speaker to identify. Your only job is to write down the speech sounds the clip contains. You always answer, with one line of JSON.";
  const prompt = [
    "The clip is a short announcer phrase that contains an invented creature name, which may be more than one word.",
    "Do NOT guess or use any official spelling of the name. Write only what you hear, sound by sound.",
    "Reply with one line of JSON and nothing else:",
    '{"heard":"the whole phrase as heard, with the name as a respelling","respelling":"the name as an English respelling, syllables joined by hyphens, the stressed syllable in CAPS","ipa":"the name in IPA","spelled_out":true or false (were any letters spoken one by one, like G-A-R),"extra":"any words or sounds beyond the phrase, or empty"}',
  ].join("\n");
  const audio = { data: readFileSync(file).toString("base64"), format: extname(file) === ".mp3" ? "mp3" : "wav" };
  let last = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await post("chat/completions", {
      model,
      modalities: ["text"],
      messages: [
        { role: "system", content: system },
        { role: "user", content: [{ type: "input_audio", input_audio: audio }, { type: "text", text: prompt }] },
      ],
    });
    const data = await res.json();
    meter.usage(step, model, data.usage);
    last = data.choices?.[0]?.message?.content ?? "";
    try {
      const out = parseLine(last);
      if (out.respelling) return out;
    } catch {
      // A refusal or prose answer; ask once more.
    }
  }
  return { raw: last.slice(0, 200) };
}

/** Chat completion held to a JSON schema. */
export async function chatJson({ model, system, user, name, schema, effort = "low", step }) {
  const body = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: typeof user === "string" ? user : JSON.stringify(user, null, 1) },
    ],
    response_format: { type: "json_schema", json_schema: { name, strict: true, schema } },
  };
  if (/^(gpt-5|o\d)/.test(model)) body.reasoning_effort = effort;
  const res = await post("chat/completions", body);
  const data = await res.json();
  meter.usage(step, model, data.usage);
  return JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
}
