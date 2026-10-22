# One file per clip: files.mjs

`pack.mjs` writes about 95 packs of about 1 MB. The game now fetches art and voice per round, so a question
should cost a few small requests, not a megabyte of other species' clips. `files.mjs` turns a packed folder
into one MP3 per take. Convert `build.mjs` output with it before the files go into `public/voice`.

```bash
node scripts/voice/files.mjs <packed-dir> <out-dir> [--clean]

# The full run, once it finishes:
node scripts/voice/files.mjs <scratchpad>/voice/full/voice public/voice --clean
```

- A single-take key becomes `<key>.<hash>.mp3` (`reveal.25.1f3a9c0b.mp3`). A key with several takes becomes
  `<key>.<n>.<hash>.mp3`, so `line.whos-that` is `line.whos-that.0.<hash>.mp3` to `.2.<hash>.mp3`. `<hash>` is
  the first 8 hex digits of the SHA-1 of the clip's bytes. The service worker caches clips by URL and never
  asks again, so a re-recorded clip needs a new name to reach a device that saved the old one. Saving for
  offline again deletes the old files (`src/pwa-save.ts`).
- Keys are letters, digits and dashes between single dots, so every name is safe in a URL as it is. The
  script refuses any other key, and two names that differ only in case.
- `index.json` stays format v1. Each take gets its own pack at offset 0: `packs[i]` is the file name and the
  take is `[i, 0, bytes, ms]`. Key order, take order, `voice`, `model` and `ms` carry over, so
  `src/audio/clips.ts` reads it unchanged.
- The bytes are copied as they are. Each pack slice is already a whole MP3 (Xing frame kept, no ID3).
- Every pack is read before anything is written, so `<out-dir>` may be `<packed-dir>`. `index.json` is
  written last. `--clean` removes every other `.mp3` in `<out-dir>`, the old packs included.
- Running it again on its own output changes nothing.

The core clips that every game needs, for the precache list: the three `line.whos-that` takes and
`line.game-over` (about 42 KiB together in the sample). `vite.config.ts` globs them as `voice/line.*.mp3`.

## Doing it in one step

After the current run finishes, add this line to `pack.mjs` `run`, right after the
`writeJson(join(ctx.out, "index.json"), ...)` line:

```js
  (await import("./files.mjs")).convert(ctx.out, ctx.out, { clean: true });
```

`build.mjs` calls `pack` on the first pass and again in every retake round, so both paths end in the
per-clip layout. Do not change `pack.mjs` while a build is running, since build imports each step as it
reaches it.

## What a question costs

Measured on the 30-species sample. On Poké Ball a question needs its reveal, its fact and four choice
names (one `first`, two `mid`, one `last`). "Who's that Pokémon?" is precached.

| clip | mean | range |
|---|---|---|
| `reveal.<dex>` | 11.3 KiB | 7.6 to 16.2 KiB |
| `fact.<dex>` | 49.9 KiB | 33.5 to 65.6 KiB |
| `choice.first` | 9.3 KiB | 6.0 to 13.5 KiB |
| `choice.mid` (two of them) | 5.9 KiB each | 3.8 to 7.6 KiB |
| `choice.last` | 7.1 KiB | 5.4 to 9.0 KiB |
| **one question** | **89 KiB in 6 requests** | 120 KiB at the largest of each |
| without the fact | 39 KiB in 5 requests | |

The fact is 56% of a question's voice bytes, so skipping it on a poor connection more than halves the
download. The question's art adds one SVG, 9 to 37 KiB for eight famous species in the sample. A 10-question
game with facts comes to about 0.9 MB of voice plus about 0.2 MB of art.
