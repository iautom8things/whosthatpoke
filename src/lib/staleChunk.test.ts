import { describe, expect, it } from "vitest";
import { reloadForMissingChunk, type ChunkReloadEnv } from "./staleChunk";

function setup() {
  const store = new Map<string, string>();
  let reloads = 0;
  const env = (now: number, online = true): ChunkReloadEnv => ({
    storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) },
    now,
    online,
    reload: () => void (reloads += 1),
  });
  return { env, reloads: () => reloads };
}

describe("reloadForMissingChunk", () => {
  it("reloads once, then leaves the Oops card up for 30 s", () => {
    const t = setup();
    expect(reloadForMissingChunk(t.env(1_000_000))).toBe(true);
    expect(reloadForMissingChunk(t.env(1_000_000 + 29_000))).toBe(false);
    expect(t.reloads()).toBe(1);
    expect(reloadForMissingChunk(t.env(1_000_000 + 31_000))).toBe(true);
    expect(t.reloads()).toBe(2);
  });

  it("never reloads while offline", () => {
    const t = setup();
    expect(reloadForMissingChunk(t.env(1_000_000, false))).toBe(false);
    expect(t.reloads()).toBe(0);
  });
});
