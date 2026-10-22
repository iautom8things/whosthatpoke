import { describe, expect, it } from "vitest";
import { scoreVoice } from "./announcer";
import { dslIssues, STEPS_PER_BAR } from "./dsl";
import { JINGLES, SONGS } from "./songs";

const all = [...Object.values(SONGS), ...Object.values(JINGLES)];

describe("songs", () => {
  it("parse without misaligned bar lines or bad notes", () => {
    expect(dslIssues).toEqual([]);
  });

  it.each(Object.values(SONGS).map((s) => [s.id, s] as const))("%s loops on a whole bar", (_, song) => {
    expect(song.loop).toBe(true);
    expect(song.steps % STEPS_PER_BAR).toBe(0);
  });

  it.each(all.map((s) => [s.id, s] as const))("%s keeps every note inside the song and in range", (_, song) => {
    for (const tr of song.tracks) {
      expect(tr.events.length, tr.name).toBeGreaterThan(0);
      for (const ev of tr.events) {
        expect(ev.step, `${tr.name} @${ev.step}`).toBeGreaterThanOrEqual(0);
        expect(ev.step + ev.len, `${tr.name} @${ev.step}`).toBeLessThanOrEqual(song.steps);
        if (tr.inst.kind === "tone") {
          // E1..E7: nothing subsonic, nothing shrill.
          expect(ev.midi, `${tr.name} @${ev.step}`).toBeGreaterThanOrEqual(28);
          expect(ev.midi, `${tr.name} @${ev.step}`).toBeLessThanOrEqual(100);
        }
      }
    }
  });
});

describe("announcer voice choice", () => {
  const v = (name: string, lang = "en-US", localService = true) => ({ name, lang, localService, default: false });
  const best = (voices: ReturnType<typeof v>[], online = true) =>
    [...voices].sort((a, b) => scoreVoice(b, online) - scoreVoice(a, online))[0].name;

  it("prefers premium and enhanced voices over compact ones", () => {
    expect(best([v("Samantha"), v("Ava (Premium)"), v("Zoe (Enhanced)")])).toBe("Ava (Premium)");
  });

  it("uses the network Google voice only when online", () => {
    const voices = [v("Google US English", "en-US", false), v("Samantha"), v("Fred")];
    expect(best(voices, true)).toBe("Google US English");
    expect(best(voices, false)).toBe("Samantha");
  });

  it("never picks a novelty voice or a non-English one", () => {
    expect(best([v("Zarvox"), v("Thomas", "fr-FR"), v("Daniel", "en-GB")])).toBe("Daniel");
  });
});
