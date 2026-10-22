import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { announcer, audio } from "../../../audio";
import type { Question } from "../../../game/deck";
import { difficultyById } from "../../../game/difficulty";
import { haptic } from "../../../lib/haptic";
import { isReducedMotion } from "../../../lib/reducedMotion";
import { useNav } from "../../../state/nav";
import { peekNext, useSession, type Phase, type Round } from "../../../state/session";
import { useSettings } from "../../../state/settings";
import { celebrate, preloadArt } from "../../components";
import { Countdown } from "./countdown";
import { gameDemo } from "./demoHooks";

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

class Timers {
  private ids = new Set<ReturnType<typeof setTimeout>>();
  later(fn: () => void, ms: number) {
    const id = setTimeout(() => {
      this.ids.delete(id);
      fn();
    }, ms);
    this.ids.add(id);
  }
  clear() {
    for (const id of this.ids) clearTimeout(id);
    this.ids.clear();
  }
}

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
    if (finishing.current) return;
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
    void announcer.say("Game over!");
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
    const s = useSession.getState();
    const q = s.current;
    const reduce = isReducedMotion();
    let alive = true;

    if (s.phase === "intro" && q) {
      sawPlay.current = true;
      answered.current = false;
      advancing.current = false;
      autoCancelled.current = false;
      finishing.current = false;
      gameOverRef.current = false;
      clockRef.current = null;
      autoRef.current = null;
      setGameOver(false);
      void preloadArt([q.answer], 1500).then(() => {
        if (!alive) return;
        patch({ ready: true });
        audio.playSong("question");
        audio.sfx("whosThat");
        t.later(() => void announcer.say("Who’s that Pokémon?"), 520);
        if (!gameDemo.hold) t.later(() => useSession.getState().beginAsking(), reduce ? 400 : INTRO_MS);
        const upcoming = peekNext();
        if (upcoming) void preloadArt([upcoming.answer], 10000);
      });
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
        if (canRun()) c.start();
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
          void announcer.say(`It’s ${q.answer.say}!`);
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
          const a = new Countdown(AUTO_ADVANCE_MS, { onEnd: () => next(true) });
          autoRef.current = a;
          patch({ factShown: true, auto: a });
          if (canRun()) a.start();
        };

        if (beat === "fact") startAuto();
        else if (beat !== "result")
          t.later(() => {
            patch({ factShown: true });
            startAuto();
          }, FACT_DELAY_MS);

        if (survivalOver) t.later(showGameOver, GAME_OVER_DELAY_MS);

        const upcoming = peekNext();
        if (upcoming) void preloadArt([upcoming.answer], 10000);
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
    const stop = () => {
      if (autoCancelled.current) return;
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
      announcer.cancel();
    },
    [],
  );

  const askQuit = useCallback(() => {
    if (quitRef.current) return;
    quitRef.current = true;
    setQuitOpen(true);
    pauseAll();
  }, [pauseAll]);

  const cancelQuit = useCallback(() => {
    quitRef.current = false;
    setQuitOpen(false);
    resumeAll();
  }, [resumeAll]);

  const confirmQuit = useCallback(() => {
    scope.current.clear();
    clockRef.current?.stop();
    autoRef.current?.stop();
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
