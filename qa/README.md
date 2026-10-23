# QA presets

`playwright-cli` configs for the devices this game must work on. WebKit stands in for iPad and iPhone Safari.

```sh
playwright-cli -s=<session> open --config=qa/playwright/ipad-landscape.json "http://localhost:<port>/?demo=<name>"
```

| preset | engine | viewport | touch |
| --- | --- | --- | --- |
| phone-portrait | webkit | 390x844 @3x | yes |
| phone-landscape | webkit | 844x390 @3x | yes |
| ipad-portrait | webkit | 820x1180 @2x | yes |
| ipad-landscape | webkit | 1180x820 @2x | yes |
| ipad-pro-landscape | webkit | 1366x1024 @2x | yes |
| projector-720 | chromium | 1280x720 | no |
| projector-480 | chromium | 854x480 | no |
| desktop-1080 | chromium | 1920x1080 | no |

## Demo URL params

Every demo: `&theme=spooky|classic`, `&projector=on|off`, `&motion=reduce`.

| demo | params |
| --- | --- |
| `game-*` | `&hold=1` freezes clocks and auto-advance, `&beat=result\|fact` pins a reveal beat, `&dex=N` sets the answer |
| `game-new` | `&mode=survival`, `&difficulty=easy\|medium\|hard\|master` |
| `game-survival` | `&streak=N` answers N more right first |
| `game-long-names` | `&reveal=1` shows the reveal instead of the question |
| `host*`, `showcase*` | `&dex=N`, `&seed=N`; showcase also `&speed=N` |
| `results-*` | `&intro=full` plays the count-up instead of jumping to the end |
| `settings` | `&tab=sound\|game\|look\|prizes\|party\|offline\|about`; on the offline tab `&pwa=installing\|reload\|ready\|error`, `&art=<n>` and `&voice=<n>` (saved pictures and clips, out of 1025 and `&clips=<n>`, default 5340), and one of `&saving=1`, `&failed=network\|full` or `&saved=1` (saved once, now short). The offline params work on the dev server only: a build's real service worker overrides them |

## Batch capture

```sh
node qa/capture.mjs --url http://localhost:<port> --out <dir> [--devices a,b] [--demos x,y] \
  [--themes spooky,classic] [--projector off,on] [--wait 1500] [--session-prefix <short>]
```

- `node qa/capture.mjs --help` prints these options.
- Devices run one at a time, so a run never holds more than one browser open. On a shared machine, one device per run keeps each browser hold short.
- Each run opens its own sessions, `<prefix>-<n>` (default prefix `wtp<pid>`), and closes only those. Keep a custom prefix short: macOS refuses socket paths past about 16 characters of session name.
- `game-*` demos get `&hold=1`, so clocks are frozen and shots compare across devices.
- Every shot is checked on disk and retried once; `manifest.json` lists a shot only if its file exists.
- playwright-cli's snapshot files land in `<dir>`, not the repo.

## Projector look

```sh
node qa/projector-sim.mjs <in.png> <out.png> [--ambient 0..1] [--letterbox 854x480]
```

`--letterbox` scales a 4:3 iPad shot into a 16:9 projector frame with black bars, like HDMI mirroring does.

## URL switches

`?nostats` keeps a visit out of the play stats, as `?demo=` and `?lab=` do. Add it whenever an agent opens the live site (`https://iautom8things.github.io/whosthatpoke/?nostats`): playwright-cli hides `navigator.webdriver`, so nothing else tells the game it is being driven.

`?demo=` and `?lab=` run on the tab's sessionStorage, so they never touch real scores or settings. `?projector=on`, `?theme=classic` and `?motion=reduce` without them save to the device like the Settings switches, so `?projector=on` works as a big-screen bookmark. On a first visit with no saved settings, a laptop that looks like it drives a projector (no touch, 1x pixels, at most 800 px tall, wider than 3:2) turns Projector mode on by itself; demos skip that check.

## Play-at-home sign

`?lab=sign` is a US Letter sign with the play-at-home QR code. Print it from the browser (Letter, no margins, background graphics on), or save the PDF:

```sh
playwright-cli -s=sign open "http://localhost:<port>/?lab=sign"
playwright-cli -s=sign run-code "async (page) => { await page.evaluate(() => document.fonts.ready); await page.pdf({ path: '<repo>/print/play-at-home-sign.pdf', format: 'Letter', printBackground: true, preferCSSPageSize: true }); }"
playwright-cli -s=sign close
```

Give `path` as an absolute path: the browser runs in its own working directory. The code itself comes from `node scripts/build-qr.mjs`, which writes `src/data/playQr.ts` and the Gengar art in `src/data/playQr.svg`. Run it again if the public URL changes.
