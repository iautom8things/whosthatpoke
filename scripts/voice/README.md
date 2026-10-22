# Recorded announcer: the build pipeline

These scripts turn one voice config into `public/voice/`: every line the game can say, recorded with an
OpenAI voice, with each Pokémon name checked against its researched pronunciation. The runtime that plays
the packs is described in plan.md section 7. This folder only makes the files.

```
data/voice/voice.json ─┐
src/data/catalog.json ─┼─ manifest ─ names ─ render ─ slice ─ master ─ pack ─ qa
data/phonetics.json ───┘   (keys)   (judge)  (WAV)  (choices) (MP3)  (index) (report)
```

## Quick start

Every command runs from the repo root. The OpenAI key comes from 1Password through the scratchpad's
`with-openai` wrapper, written here as `with-openai`. It never goes on a command line.

```bash
# The whole set, from scratch or resumed, into public/voice, with one retake round:
with-openai node scripts/voice/build.mjs --concurrency 16 --retakes 1

# A sample: a few species and lines into a scratch folder (the layout matches public/voice):
with-openai node scripts/voice/build.mjs --dex 25,130,384,778 --only "line.*,reveal.*,fact.*,choice.*,score.nice-try,prize.*" \
  --out /tmp/voice-sample/voice --report /tmp/voice-sample/qa --work /tmp/voice-sample/work
```

`build.mjs` runs the steps in order. Every output is named by a hash of its inputs, and a step skips any
output that already exists. A killed run picks up where it stopped when you rerun the same command. A
changed respelling, direction or effect re-renders only the clips it touches. Spend is printed as it goes and
logged to `<work>/cost.jsonl`.

Requirements: Node 24, plus `ffmpeg` and `ffprobe` with libmp3lame (Homebrew's build has it).

## Flags (every script)

| flag | default | |
|---|---|---|
| `--config` | `data/voice/voice.json` | the voice |
| `--out` | `public/voice` | where packs and `index.json` go |
| `--work` | `$VOICE_WORK` or `~/.cache/whosthatpoke-voice` | WAV, judged name takes, slices, MP3 takes, caches. The sample used 135 MB; the full set needs about 1.5 GB. Keep it out of `public/`. |
| `--report` | `data/voice/qa` | QA writes `<report>.json` and `<report>.md` |
| `--dex` | all | species to include, like `1-151,384` |
| `--only` | all | key globs, like `line.*,score.got.*` |
| `--concurrency` | 8 | parallel API calls per step. The sample ran at 16 with no failed calls (429s are retried quietly). |
| `--retakes N` | 0 | build only: N rounds of retaking what QA flags |
| `--steps` | all | build only: a subset, like `master,pack` |
| `--prizes` | `data/voice/prizes.json` if present | manifest only: host prize tiers |
| `--ids` | from the selection | names only: slot ids to judge, like `25,pokemon` |
| `--redo` | off | names only: re-decide names that are already settled |
| `--force` | off | slice, master: redo outputs that exist. pack: allow a partial selection into `public/voice` |
| `--dry-run` | off | render only: write `<work>/jobs.json` and stop |
| `--retake` | off | qa only: retake flagged clips, then rebuild and recheck them |

## Picking or changing the voice

Write the audition's choice over `data/voice/voice.json`:

```json
{
  "model": "gpt-4o-mini-tts",
  "voice": "ash",
  "instructions": "Voice Affect: ...\nTone: ...",
  "direction": { "line": "...", "reveal": "...", "fact": "...", "choices": "...", "score": "...", "prize": "..." },
  "effects": { "*": "", "fact": "" },
  "lufs": -16,
  "bitrate": "48k"
}
```

- `instructions` is the base brief. Each clip's instructions are the base, then `direction[kind]`, then the
  line's own note from the manifest (for example "Stress “big”."). Per the research, keep pronunciation hints
  out of it: they do not work, and words in it can leak into the read.
- `effects` is an ffmpeg `-af` chain per kind. `*` applies to every kind without its own. Mastering applies
  it after the trim and before the loudness gain. When `effects` is set, a second tail trim runs at -60 dB,
  so add `apad=pad_dur=0.5` before a reverb or echo to let its tail ring out.
- `model` may be `gpt-4o-mini-tts`, `tts-1-hd` or a `gpt-audio*` model. tts.mjs routes each one.
- Everything else falls back to `DEFAULTS` in `lib/common.mjs`: the mastering numbers, pack size,
  choice-carrier settings, the judge models and QA thresholds. Any of them can be overridden in voice.json.

`names.json` keeps its results per voice, keyed by `model/voice`. A new voice starts its names from
scratch, and switching back to an old voice reuses what that voice already settled.

## The steps

**manifest.mjs** writes `data/voice/manifest.json` from the catalog, `data/voice/words.json`, the default
prize tiers in `src/game/scoring.ts` and any host tiers: 5,340 keys, the same keys as plan.md section 3.
`text` is the line as the game shows it. `template` puts a `{slot}` wherever a name is spoken: a dex number,
or a word id like `pokemon`. That covers names inside facts too (289 facts name a species) and "Pokémon"
itself (382 places). Keys never depend on spelling.

**names.mjs** is the pronunciation loop. For each slot the selection speaks:

1. Render `It’s <Name>!` plain with the reveal direction, up to `judge.takes` times (default 3). The voice
   varies from take to take, so a candidate must be a match on every take. Its takes stop at the first that
   is not.
2. Judge each take two ways. `gpt-transcribe` writes what it hears. A blind `gpt-audio-1.5` listener,
   never told the name, writes back a respelling and IPA. A system line tells it the clip is synthetic, so it
   does not refuse. A take that is not a match gets a second, independent listen, and the better verdict
   stands. The listener's answers wander on a clean clip, while a real defect is heard twice (Iron Crown
   as "KROWD" and then "KROWND", Poltchageist as "poltergeist" both times).
3. `judge.comparator` (default `gpt-5.4-mini` at medium effort) compares those with the target `ipa` and
   `respell` from `data/phonetics.json` and returns match, near or wrong with a reason. Its prompt treats
   spellings of one sound as equal and ignores stress-only differences, because the listener marks stress
   unreliably. In two probes on known cases, low effort passed the "car vowel" Gyarados 2 times in 3, and
   medium effort got 47 of 48 calls right. gpt-5-mini and gpt-5.4-nano did about as well for less money.
   When the listener writes the target respelling exactly, no comparator call is made. Verdicts are cached
   next to each take with a version number. Changing the prompt and bumping `JUDGE_VERSION` re-asks only the
   verdicts. The audio and the listener reports stay.
4. If every take is a match, the plain name wins, and most names stop here. Otherwise variants come from the
   target respelling, the old speechSynthesis respelling and `judge.drafter` working from the IPA and from what
   each earlier try was heard as. All of them must pass the research rules in `lib/text.mjs`
   `respellingProblems`: everyday chunks, capitalized like a name, no stress caps, no letter-name chunks.
   Up to `judge.variants` variants per round, for up to `judge.rounds` rounds. Each variant is rendered and
   judged the same way, the first all-match one wins, and otherwise the best score wins (plain wins ties).
5. A name that never gets an all-match goes on the review list (`status: "review"`), printed at the end.

The judged take of the winner becomes the shipped reveal, so the reveal kids hear is a take the listener
checked. Each entry in `names.json` keeps the evidence: the plain verdict, every variant tried with what each
take was heard as and why, and the final verdict.

To override a name by ear, edit its entry under the voice key: set `"input"` to the respelling, set
`"status": "manual"` and delete `"take"`. Then rerun build. The reveal, the fact mentions and the choices
re-render with it.

**render.mjs** fills every template from `names.json`. A name with no entry is read plain, with a warning.
It renders the takes as 24 kHz WAV through `tts.mjs` jobs, plus one choice carrier per species. The jobs it
ran are written to `<work>/jobs.json`, and `tts.mjs` can replay them by hand.

**slice.mjs** cuts each carrier, `Is it A, B, C, or D?`, at its three comma pauses. silencedetect runs at
-40 dB with a 80 ms minimum, and the cuts favor long pauses where the syllable counts put the commas. Each
part must run a plausible share of the line. A carrier that will not split is re-rendered, up to 3 attempts.
After that its names are rendered alone with a position direction ("first name in a spoken list, slight
rise"). Each name gets first, mid and last takes, plus a spare mid take for retakes.

**master.mjs** applies the chain: high-pass at 70 Hz, then an end trim (20 ms lead, 120 ms tail, 60 ms for
choice slices) that keeps pauses inside the line, then the config effects. Then it measures EBU R128 loudness
and applies a static gain to `lufs`, limits at -1.5 dBFS and encodes `libmp3lame` mono 24 kHz at `bitrate`
with metadata stripped. It measures the MP3 again. A take more than 0.75 LU off target, or decoding above
-1 dBFS, is encoded again with the gain corrected or the limiter lowered, up to three more times. At 48 kbps
the codec alone can add 2.5 dB of peak, and the overshoot jumps around: lowering the ceiling 0.5 dB once
raised a decoded peak 1.6 dB. Choice slices are normalized one by one as well. The four names in a stitched line come from four different
carriers, and a shared carrier gain left them up to 6 LU apart in the sample.

**pack.mjs** writes ~1 MB packs per group (core, reveal, choice, fact) and `index.json` in the format that
`voice/build-runtime/contract.md` pins (plan.md section 7 plus optional `voice` and `model`):

```json
{ "v": 1, "voice": "ash", "model": "gpt-4o-mini-tts", "packs": ["core-0.mp3", "reveal-0.mp3"],
  "clips": { "reveal.25": [[1, 0, 10368, 1631]] } }
```

Each tuple is `[pack index, byte offset, bytes, ms]`, and each key lists its takes (`line.whos-that` has
three). Each slice of a pack is a whole MP3 file. Stale packs are removed. Writing a partial selection into
`public/voice` is refused unless you pass `--force`.

**qa.mjs** transcribes every take with `gpt-transcribe`. Transcripts are cached per file, so a rerun only
pays for new takes. It compares each transcript word by word with `text`. A literal word that is missing,
swapped or added marks the take **retake**: any edit in a short line, or more than 10% of the words in a fact.
A take shorter than half, or longer than twice, the length its syllables predict is also a retake. The
prediction is calibrated per kind on the run itself. Names never fail a take. A name transcribed far from
both its spelling and its respelling, or one on the review list, is marked **listen**. The report goes to
`<report>.json` and `<report>.md`. With `--retake` (or `build --retakes N`), each retake take gets a new
nonce, up to `qa.maxRetakes` times, and only those takes re-render. A choice retake uses its spare slice
first, then a single render.

## What a full run costs

These numbers are measured on the sample (30 species plus every core line) and on 16 random species, with
gpt-4o-mini-tts and ash at the defaults.

- 5,342 takes, about 247 minutes of audio. That is about 92 MB of MP3 at 48 kbps in about 95 packs.
  The measured lengths are longer than plan.md section 4 guessed: facts average 8.4 s and choice slices 1.24 s.
- Names: about 4.1 judged takes and 1.2 second listens per name, about $0.027 a name. That comes to about
  $28 for the 1,025 species and 12 words. A third to a half of the names end up respelled or on review: 11 of
  33 in the sample, 9 of 16 random ones. The voice really does vary between takes, and the second listen
  confirms most misses.
- Render: about 2,270 jobs (facts, carriers, scores, prizes, lines; reveals reuse their judged take) at about
  $0.0021 each, about $5.
- QA: about $1.10. Total: about $34, plus a little for retakes.
- Wall time at `--concurrency 16`, about an hour: names about 40 minutes (about 40 s a name, 16 at a time),
  render about 7, master about 4 on 10 cores, QA about 6. At 32 it is about 35 minutes, if the account's rate
  limits allow it.
- About half of the names cost comes from the comparator. `"judge": { "takes": 2, "compareEffort": "low" }`
  brings the total to roughly $20, but low effort passes the "car vowel" Gyarados and two takes catch less of
  the voice's variation.
- A new voice is a new `model/voice` page in `names.json`, so changing the voice repays the names step.

## Host prizes

Save the four Settings tiers as `data/voice/prizes.json`, `[{ "title": "...", "reward": "..." }]`, and rerun
build. Each tier gets a `prize.<slug>` clip, and the runtime finds it by slug. `lib/text.mjs` `slug` and
`src/audio/lines.ts` `slug` must stay identical; the contract's test vectors are in `lib/text.test.mjs`. A
prize typed later plays the recorded "Here’s your prize!".

## Files

- `data/voice/voice.json`: the voice config.
- `data/voice/words.json`: pronunciation targets for words that are not species: Pokémon, Poké Ball and
  the regions the facts mention.
- `data/voice/manifest.json`: generated. Commit it.
- `data/voice/names.json`: generated, with the evidence. Commit it, since it is what the recording says.
- `data/voice/qa.{json,md}`: the last QA report for the full set.
- `<work>/`: `raw/` (rendered WAV), `names/` (judged takes and their verdicts), `slices/`, `master/` (MP3
  takes, each with a `.json` of ms, bytes and loudness), `qa/` (transcripts), `retakes.json`, `cost.jsonl`.
