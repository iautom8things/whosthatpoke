import { afterEach, describe, expect, it, vi } from "vitest";
import { COPY } from "./copy";
import { fitOptions, sentences } from "./fact";
import { Timers } from "./timers";

describe("fact sentences", () => {
  it("splits on sentence ends and keeps the punctuation", () => {
    expect(sentences("It glows. Then it naps! Why? Nobody knows…")).toEqual(["It glows.", "Then it naps!", "Why?", "Nobody knows…"]);
  });

  it("keeps a piece that doesn't open like a sentence with the one before", () => {
    expect(sentences("It is 2.5 m tall. Wow.")).toEqual(["It is 2.5 m tall.", "Wow."]);
    expect(sentences("It says “Boo!” to friends. Then it hides.")).toEqual(["It says “Boo!” to friends.", "Then it hides."]);
  });

  it("returns a fact with no sentence end whole", () => {
    expect(sentences("no full stop here")).toEqual(["no full stop here"]);
  });
});

describe("fact fit options", () => {
  const fact = "It wears a rag. The costume only makes it creepier. Nobody minds.";

  it("tries the whole fact first, badges on, and never cuts a sentence", () => {
    const opts = fitOptions(fact);
    expect(opts[0]).toEqual({ text: fact, scale: 1, tight: false });
    for (const o of opts) expect(o.text.endsWith(".")).toBe(true);
    expect(opts.at(-1)).toEqual({ text: "It wears a rag.", scale: 0.74, tight: true });
  });

  it("drops trailing sentences one at a time, each tight at both sizes", () => {
    const texts = fitOptions(fact).map((o) => `${o.text.split(". ").length}@${o.scale}${o.tight ? "t" : ""}`);
    expect(texts).toEqual(["3@1", "3@1t", "3@0.86t", "2@1t", "2@0.86t", "1@1t", "1@0.86t", "1@0.74t"]);
  });

  it("offers nothing for a Pokémon with no fact", () => {
    expect(fitOptions(undefined)).toEqual([]);
    expect(fitOptions("")).toEqual([]);
  });
});

describe("choices line", () => {
  it("reads the four names as a question", () => {
    expect(COPY.choices(["Gengar", "Moltres", "Jigglypuff", "Sylveon"])).toBe("Is it Gengar, Moltres, Jigglypuff, or Sylveon?");
  });

  it("copes with short lists", () => {
    expect(COPY.choices(["Pikachu", "Eevee"])).toBe("Is it Pikachu, or Eevee?");
    expect(COPY.choices([])).toBe("");
  });
});

describe("pausable timers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("holds every job while paused and resumes with the time that was left", () => {
    vi.useFakeTimers();
    const t = new Timers();
    const fired: string[] = [];
    t.later(() => fired.push("a"), 400);
    t.later(() => fired.push("b"), 1000);
    vi.advanceTimersByTime(300);
    t.pause();
    vi.advanceTimersByTime(5000);
    expect(fired).toEqual([]);
    t.resume();
    vi.advanceTimersByTime(99);
    expect(fired).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(fired).toEqual(["a"]);
    vi.advanceTimersByTime(600);
    expect(fired).toEqual(["a", "b"]);
  });

  it("queues jobs added while paused until resume", () => {
    vi.useFakeTimers();
    const t = new Timers();
    const fn = vi.fn();
    t.pause();
    t.later(fn, 0);
    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
    t.resume();
    vi.advanceTimersByTime(0);
    expect(fn).toHaveBeenCalledOnce();
  });

  it("clear drops everything, paused or not", () => {
    vi.useFakeTimers();
    const t = new Timers();
    const fn = vi.fn();
    t.later(fn, 100);
    t.pause();
    t.later(fn, 100);
    t.clear();
    t.resume();
    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });
});
