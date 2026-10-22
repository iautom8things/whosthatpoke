import { describe, expect, it } from "vitest";
import { createHistory, MAX_RECENT, RECENT_KEY } from "./history";
import type { StorageLike } from "./storage";

function fakeStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe("history", () => {
  it("keeps answers newest first without duplicates", () => {
    const storage = fakeStorage();
    const h = createHistory(() => storage);
    h.remember([1, 2, 3]);
    expect(h.recent()).toEqual([3, 2, 1]);
    h.remember([4, 1]);
    expect(h.recent()).toEqual([1, 4, 3, 2]);
    expect(JSON.parse(storage.data.get(RECENT_KEY)!)).toEqual([1, 4, 3, 2]);
  });

  it(`stops at ${MAX_RECENT}`, () => {
    const storage = fakeStorage();
    const h = createHistory(() => storage);
    h.remember(Array.from({ length: MAX_RECENT + 50 }, (_, i) => i + 1));
    expect(h.recent()).toHaveLength(MAX_RECENT);
    expect(h.recent()[0]).toBe(MAX_RECENT + 50);
  });

  it("survives corrupt data and missing storage", () => {
    expect(createHistory(() => fakeStorage({ [RECENT_KEY]: "nope[" })).recent()).toEqual([]);
    expect(createHistory(() => fakeStorage({ [RECENT_KEY]: '[5,"x",null,-1,6]' })).recent()).toEqual([5, 6]);
    const h = createHistory(() => null);
    h.remember([7]);
    expect(h.recent()).toEqual([7]);
  });

  it("clears", () => {
    const storage = fakeStorage();
    const h = createHistory(() => storage);
    h.remember([1, 2]);
    h.clear();
    expect(h.recent()).toEqual([]);
  });
});
