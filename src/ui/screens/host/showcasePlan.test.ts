import { describe, expect, it } from "vitest";
import { asksAloud, boardFor, EVERY } from "./showcasePlan";

describe("asksAloud", () => {
  it("plays the full sting on every third silhouette, starting with the first", () => {
    const loud = Array.from({ length: 12 }, (_, i) => i + 1).filter(asksAloud);
    expect(loud).toEqual([1, 4, 7, 10]);
  });
});

describe("boardFor", () => {
  const both = { classic: [1], survival: [1] };

  it("takes turns between Classic and Survival, Classic first", () => {
    expect([1, 2, 3, 4].map((k) => boardFor(k * EVERY, both))).toEqual(["classic", "survival", "classic", "survival"]);
  });

  it("shows the other board when this turn's board is empty", () => {
    expect(boardFor(EVERY, { classic: [], survival: [1] })).toBe("survival");
    expect(boardFor(2 * EVERY, { classic: [1], survival: [] })).toBe("classic");
  });

  it("is empty only when nobody is on either board", () => {
    expect(boardFor(EVERY, { classic: [], survival: [] })).toBeNull();
  });
});
