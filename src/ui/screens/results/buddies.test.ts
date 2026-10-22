import { describe, expect, it } from "vitest";
import { isBlockedName } from "../../../game/names";
import { boardName, NAME_MAX } from "./buddies";

const isTrainerName = (name: string) => name.length > 0 && [...name].length <= NAME_MAX && !isBlockedName(name) && name !== "Trainer";

describe("boardName", () => {
  it("tidies spaces and capitalizes an all-lowercase name", () => {
    expect(boardName("  ash   ketchum ")).toBe("Ash Ketchum");
    expect(boardName("zoë")).toBe("Zoë");
  });

  it("keeps a name the kid capitalized their own way", () => {
    expect(boardName("McKenzie")).toBe("McKenzie");
    expect(boardName("BOB")).toBe("BOB");
  });

  it.each(["", "   ", "shit", "F U C K", "b!tch"])("gives %j a fun trainer name instead", (typed) => {
    expect(isTrainerName(boardName(typed))).toBe(true);
  });
});
