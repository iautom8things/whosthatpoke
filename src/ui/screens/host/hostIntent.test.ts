import { describe, expect, it } from "vitest";
import { DEAL_GUARD_MS, justDealt, swipeAction } from "./hostIntent";

describe("swipeAction", () => {
  it("judges or reveals an open card", () => {
    expect(swipeAction("right", null)).toEqual({ kind: "judge", got: true });
    expect(swipeAction("left", null)).toEqual({ kind: "judge", got: false });
    expect(swipeAction("up", null)).toEqual({ kind: "reveal" });
    expect(swipeAction("down", null)).toBeNull();
  });

  it("deals the next card when a judged card goes the way of its verdict, or up", () => {
    expect(swipeAction("right", true)).toEqual({ kind: "next", dir: 1 });
    expect(swipeAction("left", false)).toEqual({ kind: "next", dir: -1 });
    expect(swipeAction("up", true)).toEqual({ kind: "next" });
    expect(swipeAction("up", false)).toEqual({ kind: "next" });
  });

  it("changes the verdict when a judged card goes the other way", () => {
    expect(swipeAction("left", true)).toEqual({ kind: "flip", got: false });
    expect(swipeAction("right", false)).toEqual({ kind: "flip", got: true });
    expect(swipeAction("down", true)).toBeNull();
  });
});

describe("justDealt", () => {
  it("holds input back for a moment after a deal", () => {
    expect(justDealt(1000, 1000 + 150)).toBe(true);
    expect(justDealt(1000, 1000 + DEAL_GUARD_MS - 1)).toBe(true);
    expect(justDealt(1000, 1000 + DEAL_GUARD_MS)).toBe(false);
  });
});
