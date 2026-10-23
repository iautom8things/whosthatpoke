import jsQR from "jsqr";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { PLAY_QR, PLAY_URL } from "../../data/playQr";
import { QrCode } from "./QrCode";

/** Rasterizes the SVG QrCode renders, Poké Ball and all, `px` pixels wide on white. */
async function render(px: number, ink?: string) {
  const svg = renderToStaticMarkup(createElement(QrCode, { rows: PLAY_QR, ink })).replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  const { data, info } = await sharp(Buffer.from(svg)).resize(px, px).flatten({ background: "#fff" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data;
}

describe("QrCode", () => {
  // 41 modules with the quiet zone: 123 px is 3 px a module, about the smallest the kiosk screens draw.
  it.each([123, 240, 600])("draws a code that scans as the game URL at %i px", async (px) => {
    expect(await render(px)).toBe(PLAY_URL);
  });

  it("still scans in the sign's pure black", async () => {
    expect(await render(240, "#000000")).toBe(PLAY_URL);
  });
});
