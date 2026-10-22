// Remembers recently shown answers across games (localStorage "wtp.recent.v1") so the same
// Pokémon doesn't come up for every trick-or-treater.
import { browserStorage, storedValue, type StorageLike } from "./storage";

export const RECENT_KEY = "wtp.recent.v1";
export const MAX_RECENT = 200;

const parseDexList = (data: unknown): number[] =>
  Array.isArray(data) ? data.filter((d): d is number => Number.isInteger(d) && d > 0) : [];

export interface History {
  /** Newest first. */
  recent(): number[];
  /** `dex` in the order they were shown; the last one becomes the newest. */
  remember(dex: readonly number[]): void;
  clear(): void;
}

export function createHistory(storage: () => StorageLike | null = browserStorage): History {
  const value = storedValue(RECENT_KEY, parseDexList, () => [], storage);
  return {
    recent: () => value.read().slice(),
    remember(dex) {
      const merged = [...[...dex].reverse(), ...value.read()];
      value.write([...new Set(merged)].slice(0, MAX_RECENT));
    },
    clear: () => value.clear(),
  };
}

const history = createHistory();

export function recentAnswers(): number[] {
  return history.recent();
}

export function rememberAnswers(dex: readonly number[]): void {
  history.remember(dex);
}

export function clearRecent(): void {
  history.clear();
}
