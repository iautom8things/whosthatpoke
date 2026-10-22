import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CATALOG, monByDex } from "../data/catalog";
import type { Mode } from "../game/deck";
import { DEFAULT_PRIZE_TIERS } from "../game/scoring";
import { COPY } from "../ui/screens/game/copy";
import { announcement, announcementLine, prizeSentence } from "../ui/screens/results/model";
import type { VoiceIndex } from "./clips";
import { CORE_KEYS, expectedKeys, lines, NAMED_MAX, prizeKey, scoreKey, slug } from "./lines";

const VOICE = new URL("../../public/voice/", import.meta.url);
const INDEX = new URL("index.json", VOICE);
const index: VoiceIndex | null = existsSync(INDEX) ? JSON.parse(readFileSync(INDEX, "utf8")) : null;

const defaultPrizeKeys = () => DEFAULT_PRIZE_TIERS.map((t) => prizeKey(prizeSentence(t)));

describe.skipIf(!index)("the recordings in public/voice", () => {
  it("cover every line the game can say with default settings", () => {
    const missing = [...expectedKeys(CATALOG), ...defaultPrizeKeys()].filter((k) => !index!.clips[k]?.length);
    expect(missing).toEqual([]);
  });

  it("point every take inside a pack that exists", () => {
    const sizes = index!.packs.map((p) => statSync(new URL(p, VOICE)).size);
    for (const [key, takes] of Object.entries(index!.clips))
      for (const [pack, offset, bytes, ms] of takes) {
        expect(sizes[pack], key).toBeDefined();
        expect(offset + bytes, key).toBeLessThanOrEqual(sizes[pack]);
        expect(bytes > 0 && ms > 0, key).toBe(true);
      }
  });

  it("keep each take in a file of its own, so a round downloads only what it plays", () => {
    // scripts/voice/files.mjs writes this layout. A packed index would send whole packs to a guest's phone, and the
    // service worker precaches the core lines by file name (voice/line.*.mp3 in vite.config.ts).
    const takes = Object.values(index!.clips).flat();
    expect(new Set(takes.map(([pack]) => pack)).size).toBe(takes.length);
    expect(takes.length).toBe(index!.packs.length);
    for (const [pack, offset, bytes] of takes) {
      expect(offset, index!.packs[pack]).toBe(0);
      expect(bytes, index!.packs[pack]).toBe(statSync(new URL(index!.packs[pack], VOICE)).size);
    }
    for (const key of CORE_KEYS) for (const [pack] of index!.clips[key]) expect(index!.packs[pack]).toMatch(/^line\.[^/]+\.mp3$/);
  });
});

describe("clip keys", () => {
  const score = (mode: Mode, correct: number, asked: number) => scoreKey({ mode, correct, asked, perfect: mode !== "survival" && correct >= asked });

  it("have a score recording for every game length the settings offer", () => {
    for (const asked of [5, 10, 15]) {
      for (let n = 1; n < asked; n++) {
        expect(score("classic", n, asked)).toBe(`score.got.${n}-of-${asked}`);
        expect(score("host", n, asked)).toBe(`score.team.${n}-of-${asked}`);
      }
      expect(score("classic", asked, asked)).toBe(`score.perfect.${asked}`);
      expect(score("host", asked, asked)).toBe(`score.perfect.${asked}`);
    }
    for (let n = 1; n <= NAMED_MAX; n++) expect(score("survival", n, n + 3)).toBe(`score.named.${n}`);
  });

  it("have no score recording past the survival cap or for a hand-edited game length", () => {
    expect(score("survival", NAMED_MAX + 1, NAMED_MAX + 4)).toBeNull();
    for (const mode of ["classic", "host"] as const) {
      for (let n = 1; n <= 7; n++) expect(score(mode, n, 7)).toBeNull();
      expect(score(mode, 3, 50)).toBeNull();
    }
  });

  it("say Nice try for a zero in any mode and length", () => {
    for (const mode of ["classic", "host", "survival"] as const) for (const asked of [5, 7, 10]) expect(score(mode, 0, asked)).toBe("score.nice-try");
  });

  it("find the default prizes by their spoken text", () => {
    expect(defaultPrizeKeys()).toEqual([
      "prize.rookie-trainer-grab-a-treat",
      "prize.ace-trainer-big-candy",
      "prize.gym-leader-big-candy-and-bragging-rights",
      "prize.pokemon-master-pick-any-candy-you-want",
    ]);
  });

  it("cut a long prize slug and hash it, as scripts/voice does", () => {
    expect(slug("Super Duper Spooky Champion! Two full-size candy bars and a glow stick!")).toBe(
      "super-duper-spooky-champion-two-full-size-candy-ba-07409504",
    );
  });

  it("record each choice in its list position", () => {
    const mons = [25, 1, 4, 7].map(monByDex);
    const line = lines.choices(mons);
    expect(line.clips).toEqual(["choice.first.25", "choice.mid.1", "choice.mid.4", "choice.last.7"]);
    expect(line.text).toBe(COPY.choices(mons.map((m) => m.say)));
  });
});

describe("results line", () => {
  const summary = { mode: "classic" as const, correct: 7, asked: 10, perfect: false, tier: DEFAULT_PRIZE_TIERS[1] };

  it("is the score clip, then the prize clip", () => {
    const line = announcementLine(summary);
    expect(line.clips).toEqual(["score.got.7-of-10"]);
    expect(line.then?.clips).toEqual(["prize.ace-trainer-big-candy"]);
  });

  it("falls back to the same words the device voice said before", () => {
    for (const s of [summary, { ...summary, correct: 0 }, { ...summary, mode: "survival" as const, correct: 42 }, { ...summary, correct: 10, perfect: true }]) {
      const line = announcementLine(s);
      expect(`${line.text} ${line.then?.text}`).toBe(announcement(s));
    }
  });

  it("plays the recorded stand-in for a prize the host typed", () => {
    const line = announcementLine({ ...summary, tier: { ...summary.tier, title: "Ghost Queen", reward: "Two treats 👻" } });
    expect(line.then?.clips).toEqual(["prize.ghost-queen-two-treats"]);
    expect(line.then?.standIn).toEqual(["prize.custom"]);
    expect(line.then?.text).toBe("Ghost Queen! Two treats");
  });
});
