import { describe, expect, it } from "vitest";
import { isBlockedName, safeName } from "./names";

describe("name check", () => {
  it.each(["fuck", "F U C K", "fuuuuck", "Sh1t", "b!tch", "a$$", "ASS", "asss", "Big Butt Hole", "d1ck", "Fuk Face", "boooobs"])(
    "blocks %s",
    (name) => expect(isBlockedName(name)).toBe(true),
  );

  it.each(["Ash", "Misty", "Cassidy", "Sasha", "Titan", "Dickens", "Bob", "Scott", "Shiloh", "Analise", "Hancock", "Pikachu", "Kid 3", "Mr. Mime", "Zoë", "AS"])(
    "allows %s",
    (name) => expect(isBlockedName(name)).toBe(false),
  );

  it("safeName swaps a blocked name for the fallback", () => {
    expect(safeName("shit")).toBe("Trainer");
    expect(safeName("shit", "Captain Pumpkin")).toBe("Captain Pumpkin");
    expect(safeName("Brock")).toBe("Brock");
  });
});
