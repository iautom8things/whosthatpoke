// Scores persist to localStorage (key "wtp.leaderboard.v1"), or memory when storage is blocked.
import type { DifficultyId } from "./difficulty";
import type { Mode } from "./deck";
import { browserStorage, storedValue, type StorageLike } from "./storage";

export interface ScoreEntry {
  id: string;
  name: string;
  /** Dex number of the trainer's chosen buddy icon. */
  buddy: number;
  mode: Exclude<Mode, "host">;
  points: number;
  correct: number;
  total: number;
  bestStreak: number;
  difficulty: DifficultyId;
  categoryId: string;
  /** epoch ms */
  at: number;
}

export interface Leaderboard {
  add(entry: Omit<ScoreEntry, "id" | "at">): ScoreEntry;
  /** Best first. Classic sorts by points; survival by correct then points. `sinceMs` filters to tonight. */
  top(mode: ScoreEntry["mode"], limit?: number, sinceMs?: number): ScoreEntry[];
  /** 1-based rank this result would get, or null if it misses the top `limit`. Call it before add(). */
  rankFor(mode: ScoreEntry["mode"], points: number, correct: number, limit?: number, sinceMs?: number): number | null;
  /** 1-based rank of a stored entry (from add()), or null if it is outside the top `limit`. */
  rankOf(id: string, limit?: number, sinceMs?: number): number | null;
  /** Every stored entry, unsorted. Same reference until something changes (safe for useSyncExternalStore). */
  all(): readonly ScoreEntry[];
  clear(): void;
  /** Fires after add() and clear(), and when another tab changes the board. */
  subscribe(fn: () => void): () => void;
}

export const LEADERBOARD_KEY = "wtp.leaderboard.v1";
export const MAX_ENTRIES = 300;
/** When trimming, each mode's best this many survive no matter how old they are. */
const KEEP_BEST = 50;

/** How far back "tonight" reaches. */
export const TONIGHT_WINDOW_MS = 12 * 60 * 60 * 1000;
/** Start of "tonight" as epoch ms (now minus 12 hours), for `sinceMs`. */
export function TONIGHT_MS(now = Date.now()): number {
  return now - TONIGHT_WINDOW_MS;
}

type Ranked = Pick<ScoreEntry, "points" | "correct" | "at">;

/** Negative when `a` ranks above `b`. Ties go to whoever got there first. */
export function compareScores(mode: ScoreEntry["mode"], a: Ranked, b: Ranked): number {
  const primary = mode === "survival" ? b.correct - a.correct || b.points - a.points : b.points - a.points || b.correct - a.correct;
  return primary || a.at - b.at;
}

const MODES: readonly ScoreEntry["mode"][] = ["classic", "survival"];
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string";

function isEntry(v: unknown): v is ScoreEntry {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    isStr(e.id) &&
    isStr(e.name) &&
    MODES.includes(e.mode as ScoreEntry["mode"]) &&
    isNum(e.points) &&
    isNum(e.correct) &&
    isNum(e.total) &&
    isNum(e.at) &&
    isNum(e.buddy) &&
    isNum(e.bestStreak) &&
    isStr(e.difficulty) &&
    isStr(e.categoryId)
  );
}

const parseEntries = (data: unknown): ScoreEntry[] => (Array.isArray(data) ? data.filter(isEntry) : []);

/** Keeps each mode's all-time best, then the newest, up to MAX_ENTRIES. */
function trim(list: ScoreEntry[]): ScoreEntry[] {
  if (list.length <= MAX_ENTRIES) return list;
  const keep = new Set<string>();
  for (const mode of MODES) {
    list
      .filter((e) => e.mode === mode)
      .sort((a, b) => compareScores(mode, a, b))
      .slice(0, KEEP_BEST)
      .forEach((e) => keep.add(e.id));
  }
  for (const e of list.slice().sort((a, b) => b.at - a.at)) {
    if (keep.size >= MAX_ENTRIES) break;
    keep.add(e.id);
  }
  return list.filter((e) => keep.has(e.id));
}

const count = (n: number) => Math.max(0, Math.round(isNum(n) ? n : 0));

let idCounter = 0;
function newId(now: number): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ?? `${now.toString(36)}-${(idCounter++).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface LeaderboardOptions {
  storage?: () => StorageLike | null;
  /** Where "storage" events from other tabs arrive. Defaults to window. */
  events?: EventTarget | null;
  now?: () => number;
}

export function createLeaderboard(options: LeaderboardOptions = {}): Leaderboard {
  const now = options.now ?? Date.now;
  const events = options.events !== undefined ? options.events : typeof window !== "undefined" ? window : null;
  const value = storedValue(LEADERBOARD_KEY, parseEntries, () => [], options.storage ?? browserStorage);
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((fn) => fn());
  const onStorage = (event: Event) => {
    const key = (event as StorageEvent).key;
    if (key == null || key === LEADERBOARD_KEY) notify();
  };

  const ranked = (mode: ScoreEntry["mode"], sinceMs?: number) =>
    value
      .read()
      .filter((e) => e.mode === mode && (sinceMs == null || e.at >= sinceMs))
      .sort((a, b) => compareScores(mode, a, b));

  return {
    add(input) {
      const at = now();
      const entry: ScoreEntry = {
        id: newId(at),
        name: input.name.trim().slice(0, 24) || "Trainer",
        buddy: count(input.buddy),
        mode: input.mode,
        points: count(input.points),
        correct: count(input.correct),
        total: count(input.total),
        bestStreak: count(input.bestStreak),
        difficulty: input.difficulty,
        categoryId: input.categoryId,
        at,
      };
      value.write(trim([...value.read(), entry]));
      notify();
      return entry;
    },
    top: (mode, limit = 10, sinceMs) => ranked(mode, sinceMs).slice(0, limit),
    rankFor(mode, points, correct, limit = 10, sinceMs) {
      const candidate = { points, correct, at: Infinity };
      const rank = 1 + ranked(mode, sinceMs).filter((e) => compareScores(mode, e, candidate) < 0).length;
      return rank <= limit ? rank : null;
    },
    rankOf(id, limit = 10, sinceMs) {
      const entry = value.read().find((e) => e.id === id);
      if (!entry) return null;
      const rank = ranked(entry.mode, sinceMs).findIndex((e) => e.id === id) + 1;
      return rank > 0 && rank <= limit ? rank : null;
    },
    all: () => value.read(),
    clear() {
      value.clear();
      notify();
    },
    subscribe(fn) {
      if (listeners.size === 0) events?.addEventListener("storage", onStorage);
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
        if (listeners.size === 0) events?.removeEventListener("storage", onStorage);
      };
    },
  };
}

export const leaderboard: Leaderboard = createLeaderboard();
