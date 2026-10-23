// Showcase (attract mode): the projector loops on its own while the van is idle.
// Silhouette with a countdown, the reveal, and every few Pokémon the Top Trainers and a "Tap to play!" slide.
// A play-at-home QR code stays in the corner throughout. Any tap or key goes back to the title screen.
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { announcer, audio, lines, whosThat } from "../../audio";
import { monByDex } from "../../data/catalog";
import type { Mon } from "../../data/types";
import { categoryById } from "../../game/categories";
import { leaderboard, TONIGHT_MS, type ScoreEntry } from "../../game/leaderboard";
import { useInterval } from "../../lib/useInterval";
import { useNav } from "../../state/nav";
import {
  Burst,
  Display,
  IconTrophy,
  Logo,
  Panel,
  Pill,
  PokeArt,
  PokeBall,
  ScreenFrame,
  TimerRing,
  TypeBadge,
  type BallKind,
} from "../components";
import { fetchAhead, nameAhead } from "./game/prefetch";
import { showcaseDemo, type ShowcaseStart } from "./host/flags";
import { HandIcon } from "./host/HostHelp";
import { asksAloud, boardFor, EVERY, type BoardMode } from "./host/showcasePlan";
import { createShowcaseQueue, type ShowcaseQueue } from "./host/showcaseQueue";
import { PlayAtHome } from "./menus/PlayAtHome";
import s from "./host/Showcase.module.css";

const DURATION: Record<ShowcaseStart, number> = { ask: 6000, reveal: 4000, board: 8000, cta: 6000 };
/** How long a slide stays up. Soak tests speed the loop up through the demo flags. */
const duration = (kind: ShowcaseStart) => DURATION[kind] / (showcaseDemo.speed ?? 1);
const TOP = 5;

type Slide = { kind: "ask" | "reveal"; mon: Mon; n: number } | { kind: "board" | "cta"; n: number };

function following(slide: Slide, queue: ShowcaseQueue): Slide {
  switch (slide.kind) {
    case "ask":
      return { ...slide, kind: "reveal" };
    case "reveal":
      return slide.n % EVERY === 0 ? { kind: "board", n: slide.n } : { kind: "ask", mon: queue.next(), n: slide.n + 1 };
    case "board":
      return { kind: "cta", n: slide.n };
    case "cta":
      return { kind: "ask", mon: queue.next(), n: slide.n + 1 };
  }
}

function firstSlide(queue: ShowcaseQueue): Slide {
  const start = showcaseDemo.start ?? "ask";
  if (start === "board" || start === "cta") return { kind: start, n: EVERY };
  return { kind: start, mon: showcaseDemo.firstMon ?? queue.next(), n: 1 };
}

const quizKey = (slide: Slide) => (slide.kind === "ask" || slide.kind === "reveal" ? `quiz-${slide.n}` : `${slide.kind}-${slide.n}`);

const SLIDE_MOTION = {
  initial: { opacity: 0, scale: 0.94 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const } },
  exit: { opacity: 0, scale: 1.03, transition: { duration: 0.3 } },
};

export default function ShowcaseScreen() {
  const queue = useMemo(() => createShowcaseQueue(showcaseDemo.seed), []);
  const [slide, setSlide] = useState<Slide>(() => firstSlide(queue));
  const startedAt = useRef(performance.now());
  const [now, setNow] = useState(() => performance.now());
  const hold = Boolean(showcaseDemo.hold);

  useEffect(() => {
    audio.playSong("showcase");
    return () => announcer.cancel();
  }, []);

  // One timer per slide; the cleanup clears it, so nothing piles up over hours of looping.
  useEffect(() => {
    startedAt.current = performance.now();
    setNow(startedAt.current);
    if (hold) return;
    const t = window.setTimeout(() => setSlide(following(slide, queue)), duration(slide.kind));
    return () => window.clearTimeout(t);
  }, [slide, queue, hold]);

  // Sound and voice for each slide. Skipped while the tab is hidden so a background tab stays quiet.
  useEffect(() => {
    if (document.hidden) return;
    const timers: number[] = [];
    const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    let cue: { cancel(): void } | null = null;
    if (slide.kind === "ask") {
      // The ask slide runs 6 s, plenty for its name to decode before the reveal, and for the next Pokémon's art and
      // name to download.
      announcer.prepare([lines.reveal(slide.mon)]);
      void fetchAhead([nameAhead(queue.peek())]);
      later(150, () => {
        if (asksAloud(slide.n)) cue = whosThat();
        else audio.sfx("whoosh");
      });
    } else if (slide.kind === "reveal") {
      audio.sfx("reveal");
      later(250, () => void announcer.say(lines.reveal(slide.mon)));
    } else if (slide.kind === "board") {
      audio.sfx("whoosh");
    } else {
      audio.sfx("pop");
    }
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      cue?.cancel();
    };
  }, [slide, queue]);

  useInterval(() => setNow(performance.now()), slide.kind === "ask" && !hold ? 100 : null);

  // Any tap, click or key: back to the title screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || ["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;
      e.preventDefault();
      leave();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const askLeft = hold ? duration("ask") * 0.62 : Math.max(0, duration("ask") - (now - startedAt.current));
  const showTapBar = slide.kind !== "cta";

  return (
    <div className={s.root} onClick={leave} role="button" tabIndex={-1} aria-label="Tap to play">
      <ScreenFrame
        layout="fill"
        className={s.frame}
        footer={
          <div className={s.footRow}>
            <div className={s.tapBar} data-hidden={!showTapBar || undefined} aria-hidden={!showTapBar || undefined}>
              <HandIcon className={s.tapHand} />
              <span className="wtp-display">Tap anywhere to play!</span>
            </div>
            {/* In the footer, not a slide, so it never blinks while someone is scanning it. */}
            <PlayAtHome className={s.home} />
          </div>
        }
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={quizKey(slide)} className={s.slide} data-kind={slide.kind} data-n={slide.n} {...SLIDE_MOTION}>
            {slide.kind === "ask" || slide.kind === "reveal" ? (
              <Quiz mon={slide.mon} revealed={slide.kind === "reveal"} msLeft={askLeft} />
            ) : slide.kind === "board" ? (
              <TopTrainers n={slide.n} />
            ) : (
              <CallToAction />
            )}
          </motion.div>
        </AnimatePresence>
      </ScreenFrame>
    </div>
  );
}

function leave() {
  audio.sfx("select");
  useNav.getState().home();
}

/* ---------------- quiz: silhouette, countdown, reveal ---------------- */

function Quiz({ mon, revealed, msLeft }: { mon: Mon; revealed: boolean; msLeft: number }) {
  const fraction = msLeft / duration("ask");
  const seconds = Math.ceil((fraction * DURATION.ask) / 1000);
  return (
    <div className={s.quiz}>
      <div className={s.stage}>
        <Burst intensity={revealed ? 1 : 0.65} />
        <PokeArt mon={mon} revealed={revealed} />
      </div>
      <div className={s.side}>
        {revealed ? (
          <div key="reveal" className={s.reveal}>
            <Display size="xl">It’s</Display>
            <Display size="3xl" color="var(--hi)" className={s.name} style={{ "--chars": mon.name.length + 1 } as CSSProperties}>
              {mon.name}!
            </Display>
            {mon.genus && <p className={s.genus}>The {mon.genus}</p>}
            <div className={s.types}>
              {mon.types.map((t) => (
                <TypeBadge key={t} type={t} size="lg" />
              ))}
            </div>
          </div>
        ) : (
          <div key="ask" className={s.ask}>
            <Display size="2xl" className={s.askTitle}>
              Who’s that Pokémon?
            </Display>
            <div className={s.ring}>
              <TimerRing fraction={fraction} urgent={seconds <= 2} label={seconds} size="100%" />
            </div>
            <Display size="xl" color="var(--accent)" className={s.shout}>
              Shout it out!
            </Display>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Tonight's Top Trainers ---------------- */

const MEDAL: Record<number, string> = { 1: "#ffd23f", 2: "#d5dde8", 3: "#f0a35e" };

function buddyOf(entry: ScoreEntry): Mon | null {
  try {
    return monByDex(entry.buddy);
  } catch {
    return null;
  }
}

const BOARD_LABEL: Record<BoardMode, { label: string; icon: string }> = {
  classic: { label: "Classic", icon: "⭐" },
  survival: { label: "Survival", icon: "🔥" },
};

/** The break after Pokémon `n`: Classic and Survival boards take turns (see boardFor). */
function TopTrainers({ n }: { n: number }) {
  const { mode, entries } = useMemo(() => {
    const since = TONIGHT_MS();
    const top = (m: BoardMode) => (showcaseDemo.entries ? showcaseDemo.entries.filter((e) => e.mode === m).slice(0, TOP) : leaderboard.top(m, TOP, since));
    const boards = { classic: top("classic"), survival: top("survival") };
    const mode = boardFor(n, boards);
    return { mode, entries: mode ? boards[mode] : [] };
  }, [n]);
  const mascot = useMemo(() => {
    try {
      return monByDex(categoryById("all").mascot);
    } catch {
      return null;
    }
  }, []);

  return (
    <div className={s.board}>
      <div className={s.boardHead}>
        <Display size="2xl" color="var(--hi)" className={s.boardTitle}>
          <IconTrophy className={s.trophy} /> Tonight’s Top Trainers
        </Display>
        {mode && (
          <Pill tone={mode === "survival" ? "bad" : "accent"} size="lg" icon={<span aria-hidden="true">{BOARD_LABEL[mode].icon}</span>} className={s.boardMode}>
            {BOARD_LABEL[mode].label}
          </Pill>
        )}
      </div>
      {mode && entries.length > 0 ? (
        <Panel tone="solid" padding="sm" className={s.boardPanel}>
          <ol className={s.rows}>
            {entries.map((e, i) => {
              const buddy = buddyOf(e);
              const rank = i + 1;
              // Survival ranks by how many they named, so that is the number to show.
              const survival = e.mode === "survival";
              return (
                <li key={e.id} className={s.row} style={{ "--medal": MEDAL[rank] ?? "var(--raised)", "--i": i } as CSSProperties} data-top={rank <= 3 || undefined}>
                  <span className={`wtp-display ${s.rank}`}>{rank}</span>
                  <span className={s.buddy}>{buddy && <PokeArt mon={buddy} revealed outline={false} fill={0.95} />}</span>
                  <span className={s.trainer}>{e.name}</span>
                  <span className={s.score}>
                    <span className={`wtp-display ${s.points}`}>{(survival ? e.correct : e.points).toLocaleString()}</span>
                    {survival && <span className={s.unit}>named</span>}
                  </span>
                </li>
              );
            })}
          </ol>
        </Panel>
      ) : (
        <Panel tone="solid" className={s.empty}>
          <div className={s.emptyArt}>{mascot && <PokeArt mon={mascot} revealed outline={false} />}</div>
          <div className={s.emptyText}>
            <Display size="xl" className="wtp-surface-title">No Top Trainers yet!</Display>
            <p>Be the first one on the board tonight.</p>
          </div>
        </Panel>
      )}
    </div>
  );
}

/* ---------------- Tap to play! ---------------- */

const BALLS: BallKind[] = ["poke", "great", "ultra", "master"];

function CallToAction() {
  return (
    <div className={s.cta}>
      <Logo size="xl" animated bob heading={false} />
      <Display size="3xl" color="var(--hi)" className={s.ctaBig}>
        Tap to play!
      </Display>
      <Display size="lg" className={s.ctaSub}>
        Guess the Pokémon. Win candy!
      </Display>
      <div className={s.balls} aria-hidden="true">
        {BALLS.map((b, i) => (
          <span key={b} className={s.ball} style={{ "--i": i } as CSSProperties}>
            <PokeBall kind={b} size="100%" />
          </span>
        ))}
      </div>
    </div>
  );
}
