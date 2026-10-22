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
| `settings` | `&tab=game\|look\|prizes\|party\|offline\|about`; on the offline tab `&pwa=installing\|reload\|ready\|error` and `&art=<n>` (cached art count, dev server only) |

## Batch capture

```sh
node qa/capture.mjs --url http://localhost:<port> --out <dir> [--devices a,b] [--demos x,y] \
  [--themes spooky,classic] [--projector off,on] [--wait 1500] [--session-prefix <short>]
```

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

`?demo=` and `?lab=` run on the tab's sessionStorage, so they never touch real scores or settings. `?projector=on`, `?theme=classic` and `?motion=reduce` without them save to the device like the Settings switches, so `?projector=on` works as a big-screen bookmark. On a first visit with no saved settings, a laptop that looks like it drives a projector (no touch, 1x pixels, at most 800 px tall, wider than 3:2) turns Projector mode on by itself; demos skip that check.
