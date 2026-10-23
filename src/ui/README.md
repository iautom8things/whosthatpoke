# UI kit

Everything a screen needs to look like the rest of the game. Import components from `src/ui/components` and hooks from `src/lib`.

```tsx
import { Burst, ChoiceButton, PokeArt, ScreenFrame, TimerBar } from "../components";
import { useKeys, useSwipe } from "../../lib";
```

See every component live at `?lab=gallery`, and a full sample game screen built only from the kit at `?lab=gallery&view=game` (keys 1-4 answer, Space or Right goes on). Add `&theme=classic`, `&projector=on` or `&motion=reduce` to any URL.

## Ground rules

- **Touch targets are 64 px or bigger.** Every button in the kit already is. If you build your own pressable thing, give it `min-height: var(--touch-min)`.
- **Never use hover for meaning.** The iPad has no hover. Hover only adds a little brightness on mouse devices.
- **Nothing scrolls.** `ScreenFrame` fills the screen and clips. If a list can outgrow the screen (leaderboard), give that list its own `overflow: auto` and nothing else.
- **No layout shift.** Reserve space for things that appear later (the Next button, a score popup) with a fixed `min-height`.
- **Use tokens, not literal values.** Colors, sizes and timings live in `tokens.css`. Both themes and projector mode work only if you do.
- **Every press gets feedback.** Kit buttons already play a sound (`audio.sfx`), vibrate where supported and animate. Pass `sfx={null}` to silence one, or another `SfxId` to change it.
- **Keyboard works everywhere.** Presentation clickers send ArrowLeft/ArrowRight, PageUp/PageDown. Bind them with `useKeys`.
- **Long display text wraps, it never gets `white-space: nowrap`.** Use `text-wrap: balance` for titles.

## Themes and modes

`<html>` carries three attributes, set by `useThemeAttributes()` from settings (App and Gallery call it):

| attribute | values | effect |
| --- | --- | --- |
| `data-theme` | `spooky` (default), `classic` | All color tokens. Spooky: indigo night, moon, bats, pumpkins. Classic: anime blue with a white sunburst. |
| `data-projector` | `on`, `off` | Type scale x1.12, thicker strokes, opaque surfaces, no soft text, calmer backdrop, stronger silhouette rim. |
| `data-reduce-motion` | `on`, `off` | With the OS setting, stops loops and makes transitions instant. Confetti is skipped. |

Read the effective reduced-motion flag in code with `useReducedMotion()` (hook) or `isReducedMotion()` (anywhere).

## Tokens (`src/ui/tokens.css`)

**Type.** `--font-display` (Luckiest Guy, always uppercase, for titles, names, numbers) and `--font-body` (Fredoka). Fluid scale keyed to `vmin`:

| token | phone 390 | 854x480 | 1280x720 | 1920x1080 | use |
| --- | --- | --- | --- | --- | --- |
| `--fs-xs` | 14 | 14 | 15 | 18 | labels under stats, captions |
| `--fs-sm` | 16 | 16 | 18 | 22 | secondary text |
| `--fs-md` | 18 | 19 | 23 | 27 | body |
| `--fs-lg` | 22 | 24 | 29 | 36 | button labels, small titles |
| `--fs-xl` | 28 | 30 | 38 | 48 | screen titles |
| `--fs-2xl` | 36 | 40 | 51 | 67 | "Who's that Pokémon?" |
| `--fs-3xl` | 45 | 50 | 66 | 89 | big reveal names |
| `--fs-hero` | 56 | 64 | 86 | 118 | final score |

Projector mode multiplies all of them by `--boost` (1.12). On a projector viewport at least 900 px tall in landscape (a laptop at 1080p, an iPad Pro), `--fs-xs/sm/md` also get `--boost-body` (1.2), because their rem floor does not grow with the picture. Kids read display words from 3-6 m, so anything a kid needs is `--fs-lg` or bigger. Parents can read `--fs-md`.

**Color** (per theme): `--bg-0..3` sky, `--ink` text on the sky, `--ink-soft`, `--ink-dark`, `--outline` (cartoon outline), `--accent` (pumpkin / Poké red), `--accent-ink` (text on an `--accent` fill), `--hi` (yellow highlight text), `--good`, `--bad`, `--surface`, `--surface-strong`, `--surface-ink`, `--surface-display`, `--surface-title` / `--surface-title-stroke` / `--surface-title-shadow` (titles on a surface: white and outlined in spooky, plain navy in classic), `--raised*` (chips, icon buttons), `--rim` (light ring that separates dark shapes on a dark sky), `--btn-*`, `--choice-*`, `--burst-*`, `--confetti-1..6`, and `--type-<type>` for the 18 Pokémon types (same values as `TYPE_INFO`).

**Space**: `--sp-1..7` (fluid, 4 px to 88 px), `--gutter` (at least 16 px), `--safe-t/r/b/l` (iOS safe areas).
**Shape**: `--r-sm`, `--r-md`, `--r-lg`, `--r-xl`, `--r-pill`, `--stroke`, `--stroke-thick`, `--edge` (3D button depth).
**Heights**: `--touch-min` 64, `--h-md`, `--h-lg`, `--h-xl`, `--h-choice`.
**Layers**: `--z-backdrop` 0, `--z-screen` 10, `--z-hud` 30, `--z-modal` 100, `--z-confetti` 150, `--z-toast` 200.
**Motion**: `--dur-instant/fast/med/slow/reveal`, `--ease-out`, `--ease-in`, `--ease-in-out`, `--ease-pop` (overshoot).

Global utilities: `.wtp-display` (cartoon title text; set `--display-fill` to recolor), `.wtp-surface-title` (add it to a `.wtp-display` heading on a Panel; classic then draws it plain navy, because blue with a navy outline smears on a projector) and `.wtp-sr-only`.

## Layout: portrait vs landscape

Use `ScreenFrame` for every screen. Its `layout="split"` puts the first child (the stage) and the second (the side) **side by side in landscape** (silhouette left, answers right) and **stacked in portrait** (silhouette on top, answers below). The stage needs nothing but `position: relative` content: put `<Burst/>` and `<PokeArt/>` inside it and they fill it.

```tsx
<ScreenFrame layout="split" back title={<ProgressDots total={10} current={i} results={r} />} headerRight={<Stat value={score} label="Score" size="md" />}>
  <div className="stage">
    <Burst intensity={revealed ? 1 : 0.65} />
    <PokeArt mon={q.answer} revealed={revealed} />
  </div>
  <div>
    <Display size="2xl">{revealed ? `It’s ${q.answer.name}!` : "Who’s that Pokémon?"}</Display>
    <TimerBar fraction={left / total} urgent={left < 3000} />
    <div className="grid2">{/* 4 ChoiceButtons, 2 columns */}</div>
  </div>
</ScreenFrame>
```

Answer grids: 2x2 everywhere is the safe default. A 1x4 column only fits landscape screens taller than about 600 px. Phone landscape and the 854x480 projector are short: keep headers to one row and avoid stacking more than two rows of answers.

For logic that CSS cannot express, `useViewport()` returns `{ w, h, orientation, size: "phone" | "tablet" | "wide", short }`.

## Components

### Backdrop
Persistent animated background. App.tsx renders it once; screens must not. Pauses while the tab is hidden, freezes under reduced motion, simplified in projector mode. It reads the current screen to stay out from under the HUD: no moon on game, host, showcase, results or the leaderboard; no pumpkins on results and the leaderboard, nor on the play screens in portrait or short viewports; and a small moon without halo on the menus in portrait, short viewports and projector mode.

### ScreenFrame
`{ title?, back?: boolean | () => void, headerLeft?, headerRight?, sound?, footer?, layout?: "center" | "split" | "stack" | "fill", className?, bodyClassName? }`
Safe areas, header row (back slot, centered title, actions), a body that never scrolls the page, optional footer. `back` adds the back button and binds Escape. A string `title` renders as display text.
`sound` adds the `SoundButton` top right: in the header just inside `headerRight`, or alone in the corner when the screen has no header. The screens that play sound for the crowd use it (title, game, host, Show-off, results) and so does Settings. The short hops in between (category, ball, leaderboard, name entry) leave it out: nothing talks there, and their phone headers have no room for another 64 px button. The game places its own: next to the score, or in the stage's top-right corner on narrow portrait phones, where the header is full.

### SoundButton, cycleSound
The speaker the host uses to quiet the game without opening Settings. A tap (or **M** anywhere, bound in App) cycles `settings.sound`: **All on** (speaker), **No voice** (music note: the announcer stops, music and effects keep playing), **Muted** (red speaker with an X). Each change shows a toast naming the new mode, and a tap on the game's reveal does not stop the auto-advance. The mode sits on top of the saved levels (`heard()` in `state/settings.ts`) and never writes them, so muting and coming back plays at the levels the host set. A plain tap is enough on purpose: a kid's tap costs nothing that a second tap can't undo, while the hold-to-open gear guards Settings, where a kid could clear scores. `SOUND_INFO` has the names and icons for anything else that shows the mode (the Settings chips, the splash hint).

### Button
`{ variant?: "primary" | "secondary" | "ghost" | "danger" | "success", size?: "md" | "lg" | "xl", icon?, block?, sfx?: SfxId | null = "tap", onPress?, ...button props }`
```tsx
<Button size="xl" icon={<IconPlay />} onPress={start}>Play</Button>
```
One primary button per screen. Ghost adapts to the surface it sits on (inside Panel or Modal it uses the surface ink). On the sky it is opaque, so the moon or a pumpkin never shows through its label.

### ChoiceButton
`{ label, state?: "idle" | "picked" | "correct" | "wrong" | "dimmed", hint?: 1-4, onPress?, disabled?, sfx? = "select" }`
Only `idle` buttons take presses. Names auto-shrink by length (container query), so "Crabominable" fits a phone 2x2 grid with no clipping. The `hint` badge shows keyboard numbers and hides on touch-only devices. Flow: pick -> `picked`; on reveal, the answer -> `correct`, a wrong pick -> `wrong`, the rest -> `dimmed` (darkened, not see-through).

### PokeArt and preloadArt
`{ mon, revealed, outline? = true, size?, fill? = 0.86, onRevealEnd?, className? }`
Silhouette (black, with a light rim so it reads on dark projectors) or full color. Flipping `revealed` to true plays the reveal: white flash, pop, color fade, glow. It fills its parent (which needs a definite size) or a `size` square. Uses `mon.bbox` when present to center and scale the visible pixels. While hidden, the alt text is "Mystery Pokémon silhouette" and the color layer is aria-hidden, so the name never leaks. Give it `key={mon.dex}` when the Pokémon changes.
`preloadArt(mons, timeoutMs = 4000): Promise<void>` decodes images ahead of time and never rejects. Call it for the next question while the current one is on screen.

### Burst
`{ spinning? = true, intensity? 0..1 = 1, color?, color2?, rays? = 14 }`
The rotating sunburst. Fills its nearest positioned ancestor and fades out before the edges. Raise `intensity` on the reveal. In spooky the rays hold full strength out to 38cqmin (42 in projector mode), so a silhouette's wings and tails sit on light, not on the dark sky.

### Logo
`{ size?: "sm" | "md" | "lg" | "xl", animated?, bob?, heading? = true }`
The yellow, blue-outlined, tilted title lockup. `animated` drops the letters in; `bob` floats it afterward.

### Display
`{ size?: "sm" ... "hero", color?, as? }` Cartoon title text. `color="var(--hi)"` for yellow. A custom `color` always keeps the dark outline, even on a classic surface.

### PokeBall
`{ kind?: "poke" | "great" | "ultra" | "master", size?, animate?: "none" | "wobble" | "spin" | "bounce", empty?, title? }`
Inline SVG with the real colors and markings. `BALL_NAMES[kind]` gives the display name. Difficulty cards use `difficulty.ball` directly.

### TypeBadge, Pill, Chip
- `TypeBadge { type, size? }`: official type color pill.
- `Pill { tone?: "neutral" | "accent" | "good" | "bad" | "hi", icon?, size? }`: static label ("x3 streak", "+250"). The accent tone uses `--accent-ink`, dark on spooky orange.
- `Chip { selected?, onPress?, icon?, accent?, disabled? }`: 64 px toggle pill for filters and options.

### Panel, Card
- `Panel { tone?: "glass" | "solid", padding?: "none" | "sm" | "md" | "lg" }`: rounded surface. Text inside uses `--surface-ink`; display text uses `--surface-display`. Give headings `.wtp-surface-title`.
- `Card { onPress?, accent?, selected?, disabled? }`: big pressable tile with an accent band (categories, difficulties, modes). Its display text is a title (`--surface-title`).

### IconButton, BackButton
- `IconButton { icon, label, showLabel?, onPress?, variant?: "solid" | "ghost" | "primary", size?: "md" | "lg" }`: round header action. `label` is the accessible name.
- `BackButton { onPress? = nav.back, label? = "Back", showLabel? }`: arrow plus "Back" on roomy landscape screens, arrow only on phones and portrait.

### Stat, ProgressDots, TimerBar, TimerRing, Lives
- `Stat { value, label, color?, size?: "md" | "lg" | "xl", countUp? = true }`: big number that rolls up when it changes. `useCountUp(value, ms)` is exported too.
- `ProgressDots { total, current, results?: (boolean | null)[], showCount? }`: green check, red cross, glowing current, hollow future.
- `TimerBar { fraction, urgent?, label? }` and `TimerRing { fraction, urgent?, label?, size? }`: visual only; the screen owns the clock. Green above 50 %, yellow above 25 %, red below. `urgent` pulses.
- `Lives { total, remaining, ball? }`: survival lives as Poké Balls; lost ones shake and grey out.

### Modal, ConfirmDialog
- `Modal { open, onClose?, title?, actions?, dismissible? = true, variant?: "dialog" | "sheet" }`: portal dialog. Escape and a tap outside close it. While open, `#root` is inert (Tab, VoiceOver and Enter cannot reach the screen behind) and key bindings on the screen behind are blocked. On close, focus goes back to the opener only if it had keyboard focus, so a clicked X never takes the next Space.
- `ConfirmDialog { open, title, message?, confirmLabel?, cancelLabel?, tone?: "primary" | "danger", cancelIcon?, confirmIcon?, onConfirm, onCancel }`: the replacement for `window.confirm`. Focus starts on cancel. With `tone="danger"` the safe cancel is the bright primary button (play arrow) and the risky confirm an outlined button with a red edge (X), so a non-reader who opened it by accident taps the inviting one.

### ErrorBoundary
App.tsx wraps each screen in one. A render throw or a failed chunk load shows an "Oops! Tap to restart" card that reloads the page, instead of a blank screen the installed app cannot leave. Moving to another screen clears it.

### Toast
`toast(message, { tone?: "info" | "good" | "bad" | "hi", icon?, ms? = 2200, place?: "top" | "bottom" })` from anywhere. App renders `<ToastHost/>` once. `place: "bottom"` is a smaller pill at the bottom edge, for a hint that must not hide the top HUD.

### celebrate (confetti)
`celebrate(kind?: "burst" | "cannons" | "rain" | "stars", { origin?, intensity? })` fires theme-colored confetti above everything. Skipped under reduced motion. `clearConfetti()` stops it. Pair it with a sound yourself (`audio.sfx("pop")`).

### Icons
`IconBack, IconNext, IconCheck, IconX, IconPlay, IconPause, IconHome, IconRefresh, IconExpand, IconQuestion, IconVolume, IconVolumeOff, IconMusic, IconGear, IconTrophy, IconStar, IconUsers, IconEye`. 1em, `currentColor`, chunky round strokes.

## Hooks (`src/lib`)

- `useKeys(map, { enabled?, allowRepeat?, preventDefault? })`: `useKeys({ "1|2|3|4": e => pick(+e.key - 1), "ArrowRight|PageDown|Space|Enter": next, Escape: back })`. Ignores typing in fields and modifier combos. Respects Modal layers.
- `useSwipe(options)`: see below.
- `useIdle(ms, onIdle)`: fires once after `ms` with no pointer or key activity, then re-arms on the next activity. Returns a `restart()` function. `ms` of 0 or null disables it (attract mode: `useIdle(settings.attractAfterSec * 1000, () => go("showcase"))`).
- `useViewport()`: `{ w, h, orientation, size, short }`.
- `useFullscreen()`: `{ supported, active, enter, exit, toggle }` with WebKit prefixes. Call `enter` from a tap. iPhone Safari has no element fullscreen, so `supported` is false there.
- `useReducedMotion()` / `isReducedMotion()`.
- `useInterval(cb, ms | null)`: null pauses.
- `useWakeLock(enabled = true)`: keeps the screen awake (App calls it). Requests the lock again on every tap, key and return to the page while none is held; does nothing where the API is missing. The logic lives in `keepScreenAwake(env)`.
- `holdInert(el)`: makes `el` inert until every returned release runs (Modal uses it on `#root`).
- `haptic(pattern = "tap")`: `"tap" | "select" | "success" | "error" | "swipe"` or raw ms. No-op on iOS.
- `useThemeAttributes()`: mirrors settings onto `<html>`. App and Gallery call it.
- `kiosk.ts`: side-effect import that blocks pinch zoom (Safari `gesture*` events, two-finger touchmove, Ctrl+wheel), long-press menus and image drags.

### useSwipe

```tsx
const swipe = useSwipe({
  onSwipe: (dir) => (dir === "right" ? judge(true) : dir === "left" ? judge(false) : undefined),
  onCancel: () => audio.sfx("tap"),
  axis: "x", // "x" | "y" | "both" (default)
});

<div
  {...swipe.bind}
  style={{ ...swipe.bind.style, transform: `translateX(${swipe.dx}px) rotate(${swipe.dx / 18}deg)` }}
  data-dragging={swipe.dragging || undefined}
/>
```

- Pointer events, so touch, pen and mouse all work. One finger only: a second finger cancels the gesture.
- A swipe fires when the drag passes `distance` (default 25 % of the element's size on that axis, at least 60 px) **or** when a flick is faster than `velocity` (default 0.55 px/ms) and at least 24 px long.
- `dx` and `dy` update every frame while dragging for live feedback, and return to 0 on release. Animate the card out yourself in `onSwipe`; add a CSS transition for the snap back when `dragging` is false.
- `bind.style` sets `touch-action: none` so iOS does not scroll or zoom during the drag. Merge it if you pass your own style.

## App shell

App.tsx renders `<Backdrop/>`, the current screen inside a quick direction-aware transition (forward slides in from the right, back from the left, opacity-only under reduced motion), and `<ToastHost/>`. A screen's root element gets the full viewport; `ScreenFrame` handles the rest. All screen chunks are prefetched shortly after load, so transitions never flash empty.

It also owns what every screen shares:
- **Tap guard.** The leaving screen and, for 600 ms, the arriving one carry `data-busy` (`pointer-events: none`), so a kid's double tap never picks something on the screen sliding in.
- **ErrorBoundary** around each screen. A chunk that fails to load (an old tab after an update) reloads the page once first (`lib/staleChunk.ts`, wired in main.tsx); offline, or a second failure within 30 s, shows the Oops card.
- **Idle home.** Category, Difficulty and the leaderboard go back to the title after 2x `attractAfterSec` without input, results (and name entry) after 3x. The title's own idle then starts Show-off mode. Games, Host, Settings and Showcase never time out.
- **Wake lock** (`useWakeLock`).
- **F** toggles full screen and **M** cycles the sound mode (both ignored while typing).
- **Sideways hint.** In projector mode, a touch tablet held upright gets a toast asking to turn it sideways, because a mirrored portrait iPad fills a narrow column of the projector. It sits at the bottom edge for 5 s, below the game's timer bar, so the progress dots and the TOP TRAINERS pill stay visible.
