import { afterEach, describe, expect, it, vi } from "vitest";
import { storageWorks } from "../game/storage";
import { DEFAULT_SETTINGS, heard, nextSoundMode, SETTINGS_KEY, useSettings, validSettings } from "./settings";

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

describe("sound mode", () => {
  const cycle = () => useSettings.getState().update({ sound: nextSoundMode(useSettings.getState().sound) });

  it("cycles all on, no voice, muted, then all on again", () => {
    const seen = [useSettings.getState().sound];
    for (let i = 0; i < 3; i++) {
      cycle();
      seen.push(useSettings.getState().sound);
    }
    expect(seen).toEqual(["full", "noVoice", "mute", "full"]);
  });

  it("no voice keeps music and effects, mute silences everything", () => {
    const levels = { musicVolume: 0.4, sfxVolume: 0.2 };
    expect(heard({ ...levels, sound: "full" })).toEqual({ music: 0.4, sfx: 0.2, voice: true });
    expect(heard({ ...levels, sound: "noVoice" })).toEqual({ music: 0.4, sfx: 0.2, voice: false });
    expect(heard({ ...levels, sound: "mute" })).toEqual({ music: 0, sfx: 0, voice: false });
  });

  it("a mute round trip leaves the saved levels alone", () => {
    useSettings.getState().update({ musicVolume: 0.4, sfxVolume: 0.2 });
    cycle();
    cycle();
    expect(heard(useSettings.getState()).music).toBe(0);
    cycle();
    const { musicVolume, sfxVolume, sound } = useSettings.getState();
    expect({ musicVolume, sfxVolume, sound }).toEqual({ musicVolume: 0.4, sfxVolume: 0.2, sound: "full" });
  });

  it("survives a reload", async () => {
    const device = memoryStorage();
    vi.stubGlobal("localStorage", device);
    useSettings.getState().update({ sound: "mute" });
    const saved = device.getItem(SETTINGS_KEY)!;
    useSettings.setState(DEFAULT_SETTINGS);
    vi.stubGlobal("localStorage", memoryStorage({ [SETTINGS_KEY]: saved }));
    await useSettings.persist.rehydrate();
    expect(useSettings.getState().sound).toBe("mute");
  });

  it("reads an older build's announcer switch", () => {
    expect(validSettings({ voice: false })).toEqual({ sound: "noVoice" });
    expect(validSettings({ voice: true })).toEqual({});
    expect(validSettings({ voice: false, sound: "mute" })).toEqual({ sound: "mute" });
  });
});
