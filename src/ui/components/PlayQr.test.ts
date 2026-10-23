import jsQR from "jsqr";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { PLAY_URL } from "../../data/playQr";
import { PlayQr } from "./PlayQr";

/** Rasterizes the image PlayQr renders, as the bundle inlines it, `px` pixels wide. */
async function render(px: number) {
  const src: string = PlayQr({}).props.src;
  const comma = src.indexOf(",");
  const head = src.slice(0, comma), body = src.slice(comma + 1);
  const svg = head.endsWith(";base64") ? Buffer.from(body, "base64") : Buffer.from(decodeURIComponent(body));
  const { data, info } = await sharp(svg).resize(px, px).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data;
}

describe("PlayQr", () => {
  // 41 modules with the quiet zone. The title card draws it as small as 110 px and the idle card 120 px (their --qr
  // clamps), under 3 px a module. This art stops reading around 106 px, so keep the floors covered.
  it.each([110, 120, 240, 600])("draws a code that scans as the game URL at %i px", async (px) => {
    expect(await render(px)).toBe(PLAY_URL);
  });
});
