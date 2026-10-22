import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { announcer, audio, lines, whosThat, type Line } from "../../../audio";
import type { Question } from "../../../game/deck";
import { difficultyById } from "../../../game/difficulty";
import { haptic } from "../../../lib/haptic";
import { isReducedMotion } from "../../../lib/reducedMotion";
import { useNav } from "../../../state/nav";
import { peekAhead, peekNext, useSession, type Phase, type Round } from "../../../state/session";
import { useSettings } from "../../../state/settings";
import { celebrate, toast } from "../../components";
import { artLoads } from "../../components/PokeArt";
import { Countdown } from "./countdown";
import { gameDemo } from "./demoHooks";
import { AHEAD, fetchAhead, questionAhead } from "./prefetch";
import { ReadOut } from "./readOut";
import { Timers } from "./timers";

/** Silhouette swoop + "Who's that Pokémon?" before the clock starts. The sting's hit lands at ~0.9 s. */
const INTRO_MS = 1250;
/** The picked button glows yellow this long before the reveal. */
const PICK_SUSPENSE_MS = 420;
/** "Time's up!" holds this long before the reveal. */
const TIMEOUT_BEAT_MS = 950;
/** The answer buttons show right/wrong this long, then the fact card takes their place. */
const FACT_DELAY_MS = 1500;
/** Auto-advance drains this long once the fact card is up. */
export const AUTO_ADVANCE_MS = 4500;
/** With the voice on, auto-advance waits for the fact to be read, then drains this long. */
const AUTO_AFTER_FACT_MS = 2500;
/** A question whose art fails is swapped for another at most this many times in a row. */
const MAX_ART_SWAPS = 3;
/**
 * The intro waits this long for the art, so the silhouette swoops in drawn. Only a failed download swaps the
 * question; slow art counts as fine after this and shows when it lands. Questions fetched ahead are ready long
 * before; this is for the first one on a slow connection.
 */
const ART_WAIT_MS = 4000;
/** Survival: the last miss shows this long before "Game over". */
const GAME_OVER_DELAY_MS = 2300;
const GAME_OVER_AUTO_MS = 4000;
/** Ignore Next this soon after the reveal, so a double tap or key mash can't skip it. */
const NEXT_DWELL_MS = 500;
export const URGENT_SECONDS = 5;

/** Reveal buzz. Chrome logs an error for vibrate() before the page was ever tapped (demos, kiosk boot). */
function buzz(pattern: "success" | "error") {
  if (typeof navigator !== "undefined" && navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  haptic(pattern);
}

export const isStreakMilestone = (n: number) => n === 3 || (n >= 5 && n % 5 === 0);

type SessionSnapshot = ReturnType<typeof useSession.getState>;

/** True when Next should end the game instead of loading a question. */
export function isLastRound(s: Pick<SessionSnapshot, "config" | "lives" | "rounds">): boolean {
  if (!s.config) return true;
  return s.config.mode === "survival" ? s.lives <= 0 : s.rounds.length >= s.config.rounds;
}

/** Everything the screen shows about one question. A new question starts from a blank one. */
interface Moment {
  /** game seed + question index this belongs to */
  key: string;
  /** Art decoded and the swoop can play. */
  ready: boolean;
  /** Dex the player tapped (null while undecided or on a timeout). */
  picked: number | null;
  timedOut: boolean;
  clock: Countdown | null;
  factShown: boolean;
  popup: boolean;
  streakBanner: number | null;
  auto: Countdown | null;
  autoStopped: boolean;
}

const blank = (key: string, ready: boolean): Moment => ({
  key,
  ready,
  picked: null,
  timedOut: false,
  clock: null,
  factShown: false,
  popup: false,
  streakBanner: null,
  auto: null,
  autoStopped: false,
});

const keyOf = (s: Pick<SessionSnapshot, "config" | "current">) => `${s.config?.seed ?? 0}|${s.current?.index ?? -1}`;

export interface GameLoop extends Omit<Moment, "key"> {
  phase: Phase;
  question: Question | null;
  /** The round just answered, while revealed. */
  round: Round | null;
  totalMs: number;
  gameOver: boolean;
  quitOpen: boolean;
  last: boolean;
  pick(dex: number): void;
  pickIndex(i: number): void;
  next(): void;
  finish(): void;
  askQuit(): void;
  cancelQuit(): void;
  confirmQuit(): void;
}

/**
 * The play loop for classic and survival. Owns every timer of the game screen:
 * intro -> asking (clock) -> picked/time's up -> revealed (result beat, fact beat, auto-advance) -> next.
 * Session state stays the source of truth; this adds the moments between its phases.
 */
export function useGameLoop(stage: RefObject<HTMLElement | null>): GameLoop {
  const phase = useSession((s) => s.phase);
  const current = useSession((s) => s.current);
  const config = useSession((s) => s.config);
  const rounds = useSession((s) => s.rounds);
  const lives = useSession((s) => s.lives);

  const totalMs = difficultyById(config?.difficulty ?? "easy").seconds * 1000;
  const qKey = keyOf({ config, current });

  // Per-question state. A stale one (last question's) is never shown: it reads as blank.
  const [stored, setStored] = useState<Moment>(() => blank(qKey, phase !== "intro"));
  const moment = stored.key === qKey ? stored : blank(qKey, false);
  const patch = useCallback((p: Partial<Moment>) => {
    const key = keyOf(useSession.getState());
    setStored((prev) => ({ ...(prev.key === key ? prev : blank(key, false)), ...p, key }));
  }, []);

  const [gameOver, setGameOver] = useState(false);
  const [quitOpen, setQuitOpen] = useState(false);

  const scope = useRef(new Timers());
  const clockRef = useRef<Countdown | null>(null);
  const autoRef = useRef<Countdown | null>(null);
  const answered = useRef(false);
  const advancing = useRef(false);
  const finishing = useRef(false);
  const autoCancelled = useRef(false);
  const gameOverRef = useRef(false);
  const quitRef = useRef(false);
  const revealedAt = useRef(0);
  /** Resolves when the choices have been read out; the clock waits for it. null = nothing to wait for. */
  const voiceGate = useRef<Promise<void> | null>(null);
  /** This question's "Who's that Pokémon?" line, which waits about a second before it starts. */
  const asked = useRef<ReturnType<typeof whosThat> | null>(null);
  /** This question's line and names, so Keep playing can read again what the Quit dialog cut off. */
  const readOut = useRef<ReadOut<Line> | null>(null);
  const toldArt = useRef(false);
  const sawPlay = useRef(false);
  const lastQuestion = useRef<Question | null>(current);
  if (current) lastQuestion.current = current;
  const shownPhase = useRef<Phase>(phase);

  const canRun = () => !document.hidden && !quitRef.current && !gameDemo.hold;

  const pauseAll = useCallback(() => {
    clockRef.current?.pause();
    autoRef.current?.pause();
  }, []);

  const resumeAll = useCallback(() => {
    if (!canRun()) return;
    clockRef.current?.start();
    autoRef.current?.start();
  }, []);

  const stopAuto = useCallback(() => {
    autoCancelled.current = true;
    autoRef.current?.stop();
  }, []);

  const finish = useCallback(() => {
    if (finishing.current || quitRef.current) return;
    const s = useSession.getState();
    if (s.phase !== "revealed" || !isLastRound(s)) return;
    finishing.current = true;
    stopAuto();
    s.next();
  }, [stopAuto]);

  const showGameOver = useCallback(() => {
    if (gameOverRef.current) return;
    gameOverRef.current = true;
    stopAuto();
    setGameOver(true);
    audio.sfx("timeout");
    void announcer.say(lines.gameOver());
    if (useSettings.getState().autoAdvance && !gameDemo.hold) scope.current.later(finish, GAME_OVER_AUTO_MS);
  }, [finish, stopAuto]);

  const next = useCallback(
    (fromAuto = false) => {
      const s = useSession.getState();
      if (s.phase !== "revealed" || advancing.current) return;
      if (!fromAuto && performance.now() - revealedAt.current < NEXT_DWELL_MS) return;
      if (s.config?.mode === "survival" && s.lives <= 0) {
        if (gameOverRef.current) finish();
        else showGameOver();
        return;
      }
      advancing.current = true;
      stopAuto();
      announcer.cancel();
      if (isLastRound(s)) {
        finish();
        return;
      }
      audio.sfx("whoosh");
      s.next();
    },
    [finish, showGameOver, stopAuto],
  );

  const timeUp = useCallback(() => {
    const s = useSession.getState();
    if (answered.current || s.phase !== "asking") return;
    answered.current = true;
    patch({ timedOut: true });
    audio.sfx("timeout");
    const total = clockRef.current?.totalMs ?? 1;
    scope.current.later(() => useSession.getState().answer(null, 0, total), isReducedMotion() ? 500 : TIMEOUT_BEAT_MS);
  }, [patch]);

  const pick = useCallback(
    (dex: number) => {
      const s = useSession.getState();
      if (answered.current || s.phase !== "asking") return;
      answered.current = true;
      const c = clockRef.current;
      const total = c?.totalMs ?? 1;
      const left = c ? c.stop() : total;
      patch({ picked: dex });
      scope.current.later(() => useSession.getState().answer(dex, left, total), isReducedMotion() ? 160 : PICK_SUSPENSE_MS);
    },
    [patch],
  );

  const pickIndex = useCallback(
    (i: number) => {
      const s = useSession.getState();
      const mon = s.current?.choices[i];
      if (!mon || answered.current || s.phase !== "asking") return;
      audio.sfx("select");
      haptic("select");
      pick(mon.dex);
    },
    [pick],
  );

  // A fresh game when the screen opens without one in progress.
  useEffect(() => {
    const s = useSession.getState();
    if (s.phase === "idle" || s.phase === "done" || !s.current) s.start();
  }, []);

  // One run per phase of each question. Every timer it starts is cleared when the phase moves on.
  const runKey = `${phase}|${qKey}`;
  useEffect(() => {
    const t = new Timers();
    scope.current = t;
    if (quitRef.current) t.pause();
    const s = useSession.getState();
    const q = s.current;
    const reduce = isReducedMotion();
    let alive = true;

    if (s.phase === "intro" && q) {
      sawPlay.current = true;
      const easy = s.config?.difficulty === "easy";
      answered.current = false;
      advancing.current = false;
      autoCancelled.current = false;
      finishing.current = false;
      gameOverRef.current = false;
      clockRef.current = null;
      autoRef.current = null;
      voiceGate.current = null;
      readOut.current = null;
      setGameOver(false);
      const enter = () => {
        const cur = useSession.getState().current ?? q;
        patch({ ready: true });
        audio.playSong("question");
        const line = whosThat();
        asked.current = line;
        // Poké Ball reads the four names out, for kids who can't read them yet.
        const key = keyOf(useSession.getState());
        const voice = new ReadOut({
          line: lines.whosThat(),
          names: easy ? lines.choices(cur.choices) : null,
          say: (l) => announcer.say(l),
          cut: () => keyOf(useSession.getState()) !== key || answered.current || quitRef.current,
        });
        readOut.current = voice;
        const read = voice.start(line);
        if (easy) voiceGate.current = read;
        if (!gameDemo.hold) t.later(() => useSession.getState().beginAsking(), reduce ? 400 : INTRO_MS);
        // This question's clips decode while "Who's that" plays, and the next one's well ahead of it.
        const upcoming = peekNext();
        announcer.prepare([cur, upcoming].flatMap((it) => (it ? questionAhead(it, easy).lines : [])));
      };
      // This question, then the next two: each one's art, then its lines. Most were fetched a question or two ago.
      void fetchAhead([q, ...peekAhead(AHEAD)].map((it) => questionAhead(it, easy)));
      // Never ask about a "?" tile: art that fails to load gets the question swapped for another.
      void (async () => {
        let mon = q.answer;
        for (let swaps = 0; ; swaps++) {
          const ok = await artLoads(mon, ART_WAIT_MS);
          if (!alive) return;
          if (ok) break;
          if (swaps >= MAX_ART_SWAPS || !useSession.getState().swapCurrent()) {
            if (!toldArt.current) toast("Some pictures won’t load. Check the connection.", { tone: "bad", ms: 4000 });
            toldArt.current = true;
            break;
          }
          mon = useSession.getState().current?.answer ?? mon;
        }
        t.later(enter, 0);
      })();
    }

    if (s.phase === "asking" && q) {
      sawPlay.current = true;
      audio.playSong("question");
      let c: Countdown | null = null;
      if (useSettings.getState().timer) {
        const total = difficultyById(s.config?.difficulty ?? "easy").seconds * 1000;
        c = new Countdown(total, {
          startMs: gameDemo.clock?.index === q.index ? gameDemo.clock.ms : undefined,
          onSecond: (sec) => {
            if (sec >= 1 && sec <= URGENT_SECONDS) audio.sfx(sec > 3 ? "tick" : "tickUrgent");
          },
          onEnd: timeUp,
        });
        // Poké Ball: the clock starts once the choices have been read out.
        const gate = voiceGate.current;
        if (gate) void gate.then(() => alive && canRun() && c?.start());
        else if (canRun()) c.start();
      }
      clockRef.current = c;
      patch({ ready: true, clock: c });
    }

    if (s.phase === "revealed" && q) {
      sawPlay.current = true;
      const round = s.rounds.at(-1);
      if (round && round.question.index === q.index) {
        revealedAt.current = performance.now();
        answered.current = true;
        advancing.current = false;
        clockRef.current?.stop();

        const settings = useSettings.getState();
        const survivalOver = s.config?.mode === "survival" && s.lives <= 0;
        const beat = gameDemo.beat;
        const fact = lines.fact(q.answer);
        // The announcer reads the fact after the name, and auto-advance waits for it. On a poor connection a fact
        // whose clip isn't on the device is left out, and auto-advance goes as if there were none.
        const readsFact = fact !== undefined && settings.voice && announcer.supported && !survivalOver && !announcer.skips(fact);
        let voiceDone: Promise<void> = Promise.resolve();
        patch({ ready: true, picked: round.picked, timedOut: round.picked === null, popup: beat !== "fact", factShown: beat === "fact" });

        t.later(() => {
          if (round.correct) {
            audio.sfx("correct");
            buzz("success");
            const r = stage.current?.getBoundingClientRect();
            const origin = r ? { x: (r.left + r.width / 2) / innerWidth, y: (r.top + r.height * 0.42) / innerHeight } : undefined;
            celebrate("burst", { origin, intensity: 0.75 });
          } else if (round.picked === null) {
            audio.sfx("reveal");
          } else {
            audio.sfx("wrong");
            buzz("error");
          }
          // One line with the fact chained on: cancel() in next() or Quit stops both. A fast answer waits for
          // "Who's that Pokémon?" to finish, and the beats hold that wait behind the Quit dialog.
          const reveal = lines.reveal(q.answer);
          const say = () => announcer.say(readsFact ? { ...reveal, then: fact } : reveal);
          const ask = asked.current;
          const said = ask ? ask.finish().then(() => new Promise<void>((done) => t.later(() => void say().then(done), 0))) : say();
          if (readsFact) voiceDone = said;
        }, 0);
        if (!gameDemo.hold) t.later(() => patch({ popup: false }), 2100);

        if (round.correct && isStreakMilestone(s.streak) && beat !== "fact") {
          t.later(() => {
            patch({ streakBanner: s.streak });
            audio.sfx("streak");
            celebrate("cannons", { intensity: s.streak >= 10 ? 1.4 : 1 });
          }, reduce ? 200 : 700);
          if (!gameDemo.hold) t.later(() => patch({ streakBanner: null }), 2900);
        }

        const startAuto = () => {
          if (!settings.autoAdvance || autoCancelled.current || survivalOver) return;
          const drain = (ms: number) => {
            if (!alive || autoCancelled.current) return;
            const a = new Countdown(ms, { onEnd: () => next(true) });
            autoRef.current = a;
            patch({ auto: a });
            if (canRun()) a.start();
          };
          if (readsFact) void voiceDone.then(() => drain(AUTO_AFTER_FACT_MS));
          else drain(AUTO_ADVANCE_MS);
        };

        if (beat === "fact") startAuto();
        else if (beat !== "result")
          t.later(() => {
            patch({ factShown: true });
            startAuto();
          }, FACT_DELAY_MS);

        if (survivalOver) t.later(showGameOver, GAME_OVER_DELAY_MS);
      }
    }

    if (s.phase === "done" && sawPlay.current) {
      useNav.getState().go("results", { replace: true });
    }

    return () => {
      alive = false;
      t.clear();
      clockRef.current?.pause();
      autoRef.current?.pause();
    };
    // runKey captures the phase, question and game; the callbacks it uses are stable.
  }, [runKey]);

  // Any touch or key on the reveal stops the auto-advance: someone wants to look longer.
  useEffect(() => {
    if (phase !== "revealed") return;
    const stop = (e: Event) => {
      // Taps and keys on the Quit dialog, and the X or Escape that opens it, are about quitting, not the reveal.
      if (autoCancelled.current || quitRef.current) return;
      if (e instanceof KeyboardEvent ? e.key === "Escape" : (e.target as Element | null)?.closest?.("[data-quit]")) return;
      autoCancelled.current = true;
      if (autoRef.current && !autoRef.current.isFinished) {
        autoRef.current.stop();
        patch({ autoStopped: true });
      }
    };
    window.addEventListener("pointerdown", stop, true);
    window.addEventListener("keydown", stop, true);
    return () => {
      window.removeEventListener("pointerdown", stop, true);
      window.removeEventListener("keydown", stop, true);
    };
  }, [phase, patch]);

  // The clock stops while the tab is hidden (iPad locked, projector laptop switched apps).
  useEffect(() => {
    const onVisibility = () => (document.hidden ? pauseAll() : resumeAll());
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [pauseAll, resumeAll]);

  useEffect(
    () => () => {
      scope.current.clear();
      clockRef.current?.pause();
      autoRef.current?.pause();
      asked.current?.cancel();
      announcer.cancel();
    },
    [],
  );

  // The Quit dialog freezes everything behind it: clocks, the beats still to come and the announcer.
  const askQuit = useCallback(() => {
    if (quitRef.current) return;
    quitRef.current = true;
    setQuitOpen(true);
    pauseAll();
    scope.current.pause();
    asked.current?.cancel();
    announcer.cancel();
  }, [pauseAll]);

  const cancelQuit = useCallback(() => {
    quitRef.current = false;
    setQuitOpen(false);
    scope.current.resume();
    // Read again the line or names the dialog cut off. On Poké Ball the clock waits for them again.
    const again = readOut.current?.resume();
    if (again && voiceGate.current) {
      voiceGate.current = again;
      const c = clockRef.current;
      if (c) void again.then(() => clockRef.current === c && canRun() && c.start());
      return;
    }
    resumeAll();
  }, [resumeAll]);

  const confirmQuit = useCallback(() => {
    scope.current.clear();
    clockRef.current?.stop();
    autoRef.current?.stop();
    asked.current?.cancel();
    announcer.cancel();
    setQuitOpen(false);
    useSession.getState().quit();
    useNav.getState().home();
    audio.playSong(useSettings.getState().theme === "spooky" ? "spooky" : "title");
  }, []);

  // After a quit the session is idle while the screen slides out; keep showing what was there.
  if (phase !== "idle") shownPhase.current = phase;
  const visible = shownPhase.current;
  const question = current ?? lastQuestion.current;
  const last = rounds.at(-1);
  const round = (visible === "revealed" || visible === "done") && last && question && last.question.index === question.index ? last : null;
  const { key: _key, ...shown } = phase === "idle" ? stored : moment;

  return {
    ...shown,
    phase: visible,
    question,
    round,
    totalMs,
    gameOver,
    quitOpen,
    last: phase === "revealed" && isLastRound({ config, lives, rounds }),
    pick,
    pickIndex,
    next: () => next(false),
    finish,
    askQuit,
    cancelQuit,
    confirmQuit,
  };
}
