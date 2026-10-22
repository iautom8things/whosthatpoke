import { describe, expect, it } from "vitest";
import { holdInert } from "./inert";

describe("holdInert", () => {
  it("keeps the element inert until the last hold is released", () => {
    const root = { inert: false };
    const a = holdInert(root);
    const b = holdInert(root);
    a();
    expect(root.inert).toBe(true);
    b();
    expect(root.inert).toBe(false);
  });

  it("ignores a second release of the same hold", () => {
    const root = { inert: false };
    const a = holdInert(root);
    const b = holdInert(root);
    a();
    a();
    expect(root.inert).toBe(true);
    b();
    expect(root.inert).toBe(false);
  });

  it("survives a StrictMode mount, unmount, mount", () => {
    const root = { inert: false };
    holdInert(root)();
    const live = holdInert(root);
    expect(root.inert).toBe(true);
    live();
    expect(root.inert).toBe(false);
  });
});
