import { describe, expect, it } from "vitest";
import { dealWithArt, MAX_ART_SWAPS } from "./artCheck";

/** A deck of answers whose art loads or not, with `spares` cards left to swap in. */
function table(cards: { name: string; ok: boolean }[], spares = cards.length - 1) {
  let at = 0;
  const checked: string[] = [];
  const deal = {
    current: () => cards[at],
    loads: async (c: { name: string; ok: boolean }) => (checked.push(c.name), c.ok),
    swap: () => (at < spares ? (at++, true) : false),
  };
  return { deal, checked, onTable: () => cards[at].name };
}

describe("dealWithArt", () => {
  it("keeps a card whose art loads", async () => {
    const t = table([{ name: "pikachu", ok: true }]);
    expect(await dealWithArt(t.deal)).toBe(true);
    expect(t.checked).toEqual(["pikachu"]);
  });

  it("swaps a card whose art fails for the next one that loads", async () => {
    const t = table([
      { name: "eevee", ok: false },
      { name: "ditto", ok: false },
      { name: "mew", ok: true },
    ]);
    expect(await dealWithArt(t.deal)).toBe(true);
    expect(t.checked).toEqual(["eevee", "ditto", "mew"]);
    expect(t.onTable()).toBe("mew");
  });

  it("plays the card as it is when no spare is left", async () => {
    const t = table([{ name: "eevee", ok: false }], 0);
    expect(await dealWithArt(t.deal)).toBe(false);
    expect(t.onTable()).toBe("eevee");
  });

  it("gives up after a few swaps when nothing loads (offline)", async () => {
    const t = table(Array.from({ length: 10 }, (_, i) => ({ name: `mon${i}`, ok: false })));
    expect(await dealWithArt(t.deal)).toBe(false);
    expect(t.checked).toHaveLength(MAX_ART_SWAPS + 1);
  });
});
