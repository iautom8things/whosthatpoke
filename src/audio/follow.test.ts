import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, useSettings } from "../state/settings";
import { followSettings } from "./follow";

afterEach(() => useSettings.setState(DEFAULT_SETTINGS));

function listen() {
  const calls: string[] = [];
  const stop = followSettings(useSettings, {
    music: (v) => calls.push(`music ${v}`),
    sfx: (v) => calls.push(`sfx ${v}`),
    voice: (on) => calls.push(`voice ${on ? "on" : "off"}`),
  });
  return { calls, stop };
}

describe("the engine follows the sound mode", () => {
  it("mute silences everything and coming back plays at the saved levels", () => {
    useSettings.getState().update({ musicVolume: 0.4, sfxVolume: 0.2 });
    const { calls, stop } = listen();
    const set = (sound: "full" | "noVoice" | "mute") => useSettings.getState().update({ sound });

    set("noVoice");
    set("mute");
    set("full");
    stop();

    expect(calls).toEqual([
      "music 0.4",
      "sfx 0.2",
      "voice on",
      "voice off", // no voice: music and effects stay
      "music 0",
      "sfx 0",
      "music 0.4",
      "sfx 0.2",
      "voice on",
    ]);
  });

  it("a level changed while muted stays silent until sound comes back", () => {
    useSettings.getState().update({ sound: "mute" });
    const { calls, stop } = listen();

    useSettings.getState().update({ musicVolume: 0.9 });
    expect(calls).toEqual(["music 0", "sfx 0", "voice off"]);

    useSettings.getState().update({ sound: "noVoice" });
    stop();
    expect(calls.slice(3)).toEqual(["music 0.9", `sfx ${DEFAULT_SETTINGS.sfxVolume}`]);
  });
});
