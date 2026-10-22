import { afterEach, describe, expect, it, vi } from "vitest";
import { storageWorks } from "../game/storage";
import { DEFAULT_SETTINGS, SETTINGS_KEY, useSettings, validSettings } from "./settings";

const memoryStorage = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
};

afterEach(() => {
  vi.unstubAllGlobals();
  useSettings.setState(DEFAULT_SETTINGS);
});

describe("stored settings", () => {
  it("drops fields with the wrong type or range", () => {
    const junk = { rounds: "lots", theme: "neon", prizeTiers: [{ min: "x" }], musicVolume: null, sfxVolume: 3, attractAfterSec: -5, voice: "yes" };
    expect(validSettings(junk)).toEqual({});
    expect({ ...DEFAULT_SETTINGS, ...validSettings(junk) }).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps good fields", () => {
    const tiers = [{ minCorrect: 0, title: "Rookie", reward: "Treat", emoji: "🍬", color: "#fff" }];
    const good = { rounds: 5, theme: "classic", musicVolume: 0, projector: true, attractAfterSec: 0, prizeTiers: tiers, extra: 1 };
    expect(validSettings(good)).toEqual({ rounds: 5, theme: "classic", musicVolume: 0, projector: true, attractAfterSec: 0, prizeTiers: tiers });
    expect(validSettings({ prizeTiers: null })).toEqual({ prizeTiers: null });
    expect(validSettings({ prizeTiers: [] })).toEqual({});
  });

  it("reads non-objects as nothing stored", () => {
    for (const v of [null, undefined, 7, "x", []]) expect(validSettings(v)).toEqual({});
  });

  it("hydrates junk from an older build as defaults, keeping the good fields", async () => {
    const stored = { state: { rounds: "lots", theme: "neon", musicVolume: null, attractAfterSec: -5, projector: true }, version: 1 };
    vi.stubGlobal("localStorage", memoryStorage({ [SETTINGS_KEY]: JSON.stringify(stored) }));
    await useSettings.persist.rehydrate();
    const { rounds, theme, musicVolume, attractAfterSec, projector } = useSettings.getState();
    expect({ rounds, theme, musicVolume, attractAfterSec, projector }).toEqual({
      rounds: DEFAULT_SETTINGS.rounds,
      theme: DEFAULT_SETTINGS.theme,
      musicVolume: DEFAULT_SETTINGS.musicVolume,
      attractAfterSec: DEFAULT_SETTINGS.attractAfterSec,
      projector: true,
    });
  });

  it("a full localStorage keeps the change for this visit, never throws, and says scores won't save", () => {
    const full = { ...memoryStorage(), setItem: () => { throw new DOMException("full", "QuotaExceededError"); } };
    vi.stubGlobal("localStorage", full);
    expect(() => useSettings.getState().update({ theme: "classic" })).not.toThrow();
    expect(useSettings.getState().theme).toBe("classic");
    expect(storageWorks()).toBe(false);
  });
});
