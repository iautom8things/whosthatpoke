import jsQR from "jsqr";
import { describe, expect, it } from "vitest";
import { PLAY_QR, PLAY_URL } from "../../data/playQr";
import { QUIET, qrShape } from "./qrShape";

/** Paints the code at `px` pixels a module, with the center hole filled `hole` (the Poké Ball reads as either). */
function paint(rows: readonly string[], px: number, hole: "light" | "dark") {
  const { at, size } = qrShape(rows).hole;
  const span = (rows.length + QUIET * 2) * px;
  const data = new Uint8ClampedArray(span * span * 4).fill(255);
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows.length; x++) {
      const inHole = x >= at && x < at + size && y >= at && y < at + size;
      if (!(inHole ? hole === "dark" : rows[y][x] === "1")) continue;
      for (let dy = 0; dy < px; dy++) {
        const start = (((y + QUIET) * px + dy) * span + (x + QUIET) * px) * 4;
        for (let i = 0; i < px * 4; i += 4) data.fill(0, start + i, start + i + 3);
      }
    }
  }
  return { data, span };
}

describe("play-at-home QR code", () => {
  it.each(["light", "dark"] as const)("reads as the game URL with a %s center under the Poké Ball", (hole) => {
    const { data, span } = paint(PLAY_QR, 6, hole);
    expect(jsQR(data, span, span)?.data).toBe(PLAY_URL);
  });

  it("leaves the finder eyes and timing lines out of the hole", () => {
    const { at, size } = qrShape(PLAY_QR).hole;
    expect(at).toBeGreaterThan(7);
    expect(at + size).toBeLessThanOrEqual(PLAY_QR.length - 7);
  });
});
