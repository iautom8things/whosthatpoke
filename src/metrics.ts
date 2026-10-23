// What the game counts, sent through src/lib/metrics.ts: games started, finished and quit, every Pokémon named or
// missed, and errors. src/pwa.ts counts Save for offline itself. Everything here is a no-op while metrics are off.
//
// Games are read from the session store, outside React, so each start, finish and quit is seen exactly once
// whichever screen caused it. This file must not import src/pwa.ts (it pulls virtual:pwa-register, which vitest
// can't load), so main.tsx passes isInstalled() in.

import { categoryById } from "./game/categories";
import type { GameConfig } from "./game/deck";
import { difficultyById } from "./game/difficulty";
import { DEFAULT_PRIZE_TIERS, prizeFor } from "./game/scoring";
import { pageview, startMetrics, track, type EventData } from "./lib/metrics";
import { network } from "./lib/network";
import { useNav } from "./state/nav";
import { useSession, type Round } from "./state/session";
import { heard, useSettings } from "./state/settings";

export type Send = (name: string, data?: EventData) => void;
type Game = ReturnType<typeof useSession.getState>;

/** Error events per page load, so a crash loop or a noisy handler can't flood the outbox. */
const MAX_FAULTS = 5;
const MESSAGE_CHARS = 100;

const about = (c: GameConfig): EventData => ({ mode: c.mode, category: c.categoryId, difficulty: difficultyById(c.difficulty).label });

function started(c: GameConfig): EventData {
  const st = useSettings.getState();
  // What the game actually plays, after the sound button.
  const on = heard(st);
  return {
    ...about(c),
    group: categoryById(c.categoryId).group,
    rounds: c.mode === "survival" ? undefined : c.rounds,
    voice: on.voice,
    music: on.music > 0,
    timer: st.timer,
    auto_advance: st.autoAdvance,
    theme: st.theme,
    projector: st.projector,
  };
}

/** The prize tier's title, as the results screen picks it. Tiers the host wrote say only "custom". */
function prize(g: Game, c: GameConfig): string {
  if (useSettings.getState().prizeTiers) return "custom";
  return prizeFor(g.correct, c.rounds > 0 ? c.rounds : 10, DEFAULT_PRIZE_TIERS).title;
}

function roundEvent(c: GameConfig, r: Round): [string, EventData] {
  const mon = r.question.answer;
  const data = { pokemon: mon.name, dex: mon.dex, ...about(c) };
  if (r.correct) return ["pokemon_named", data];
  const how = c.mode === "host" ? "host" : r.picked === null ? "timeout" : "wrong";
  return ["pokemon_missed", { ...data, how, picked: r.question.choices.find((m) => m.dex === r.picked)?.name }];
}

/**
 * Counts every game the session store plays. The rounds go out once the game ends, finished or quit, because host
 * mode can flip the last verdict after the reveal. Returns the unsubscribe.
 */
export function watchGames(send: Send = track, now: () => number = Date.now): () => void {
  let startedAt = now();
  const rounds = (g: Game, c: GameConfig) => {
    for (const r of g.rounds) send(...roundEvent(c, r));
  };
  return useSession.subscribe((s, prev) => {
    try {
      // The game went away before it was done: Quit, Back, or a new game started over it.
      if (prev.config && s.config !== prev.config && prev.phase !== "done") {
        send("game_quit", { ...about(prev.config), asked: prev.rounds.length, correct: prev.correct });
        rounds(prev, prev.config);
      }
      if (s.config && s.config !== prev.config) {
        startedAt = now();
        send("game_start", started(s.config));
      }
      if (s.config && s.phase === "done" && prev.phase !== "done") {
        send("game_finish", {
          ...about(s.config),
          asked: s.rounds.length,
          correct: s.correct,
          score: s.score,
          best_streak: s.bestStreak,
          prize: prize(s, s.config),
          seconds: Math.round((now() - startedAt) / 1000),
        });
        rounds(s, s.config);
      }
    } catch {
      // Counting never gets in the way of the game.
    }
  });
}

/** An error as one short line, without URLs: they can carry a query string. */
export function errorMessage(error: unknown): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error ?? "");
  return text
    .replace(/\S*:\/\/\S*|\b(?:blob|data):\S*/gi, "[url]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MESSAGE_CHARS);
}

export type FaultKind = "crash" | "error" | "rejection" | "chunk" | "art";
let faults = 0;

/** Counts an error with the screen and connection it happened on. At most MAX_FAULTS per page load. */
export function fault(kind: FaultKind, error?: unknown): void {
  try {
    if (faults >= MAX_FAULTS) return;
    faults++;
    track("error", { kind, screen: useNav.getState().screen, net: network.quality, message: errorMessage(error) });
  } catch {
    // Counting never gets in the way of the game.
  }
}

/** Starts counting, when this is the real game. Call once from main.tsx, after the URL's settings apply. */
export function startGameMetrics(installed: () => boolean): void {
  try {
    if (!startMetrics()) return;
    pageview();
    track("app_open", { display: installed() ? "installed" : "browser", projector: useSettings.getState().projector });
    watchGames();
    window.addEventListener("error", (e) => fault("error", e.error ?? e.message));
    window.addEventListener("unhandledrejection", (e) => fault("rejection", e.reason));
  } catch {
    // Counting never gets in the way of the game.
  }
}
