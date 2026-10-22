import { beforeEach, describe, expect, it, vi } from "vitest";
import { monByDex } from "../../../data/catalog";

const steps: string[] = [];
const gates: (() => void)[] = [];
/** Each download waits until the test lets it through. */
const gated = (what: string) => {
  steps.push(what);
  return new Promise<void>((r) => gates.push(r));
};

vi.mock("../../../audio", async () => ({
  lines: (await import("../../../audio/lines")).lines,
  announcer: { prefetch: (ls: ({ clips: string[] } | false | undefined)[]) => gated(`lines ${ls.flatMap((l) => (l ? [l.clips[0]] : [])).join(" ")}`) },
}));
vi.mock("../../components/PokeArt", () => ({ loadArt: (m: { art: string }) => gated(`art ${m.art}`) }));

const { fetchAhead, questionAhead } = await import("./prefetch");

const question = (dex: number, index: number) => ({ index, answer: monByDex(dex), choices: [monByDex(dex), monByDex(1), monByDex(4), monByDex(7)] });
const letThrough = async (n = 1) => {
  for (let i = 0; i < n; i++) {
    gates.shift()?.();
    await new Promise((r) => setTimeout(r, 0));
  }
};

beforeEach(() => {
  steps.length = 0;
  gates.length = 0;
});

describe("fetching ahead", () => {
  it("downloads one question at a time, art first, then its lines", async () => {
    void fetchAhead([question(25, 0), question(133, 1)].map((q) => questionAhead(q, true)));
    await letThrough(4);
    expect(steps).toEqual([
      "art pokemon/25.svg",
      "lines reveal.25 fact.25 choice.first.25",
      "art pokemon/133.svg",
      "lines reveal.133 fact.133 choice.first.133",
    ]);
  });

  it("reads the choices out only on Poké Ball", async () => {
    void fetchAhead([questionAhead(question(25, 0), false)]);
    await letThrough(2);
    expect(steps[1]).toBe("lines reveal.25 fact.25");
  });

  it("stops where it is when a newer call takes over", async () => {
    void fetchAhead([question(25, 0), question(133, 1)].map((q) => questionAhead(q, false)));
    void fetchAhead([question(133, 1), question(94, 2)].map((q) => questionAhead(q, false)));
    await letThrough(6);
    expect(steps).toEqual(["art pokemon/25.svg", "art pokemon/133.svg", "lines reveal.133 fact.133", "art pokemon/94.svg", "lines reveal.94 fact.94"]);
  });
});
