#!/usr/bin/env node
// Approximates how a screenshot looks on a cheap projector in a dim driveway:
// low native resolution, lifted blacks, crushed contrast and weak saturation.
//
//   node qa/projector-sim.mjs <in.png> [out.png] [--ambient 0..1] [--letterbox 854x480]
//
// --ambient raises the black level further, like porch lights spilling on the screen (default 0.35).
// --letterbox fits the shot inside a projector's frame with black bars first, the way a 4:3 iPad
// mirrored over HDMI lands on a 16:9 projector.
import sharp from "sharp";

const [input, maybeOut, ...rest] = process.argv.slice(2);
if (!input) {
  console.error("usage: node qa/projector-sim.mjs <in.png> [out.png] [--ambient 0..1] [--letterbox WxH]");
  process.exit(1);
}
const out = maybeOut && !maybeOut.startsWith("--") ? maybeOut : input.replace(/\.png$/, ".projector.png");
const ambientIdx = rest.indexOf("--ambient");
const ambient = ambientIdx >= 0 ? Number(rest[ambientIdx + 1]) : 0.35;
const boxIdx = rest.indexOf("--letterbox");
const box = boxIdx >= 0 ? /^(\d+)x(\d+)$/.exec(rest[boxIdx + 1] ?? "") : null;
if (boxIdx >= 0 && !box) {
  console.error("--letterbox takes WIDTHxHEIGHT, e.g. 854x480");
  process.exit(1);
}

// Letterboxed: the projector's panel is the frame, and the shot is scaled into it.
const source = box
  ? await sharp(input)
      .resize(Number(box[1]), Number(box[2]), { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 1 } })
      .flatten({ background: "#000" })
      .png()
      .toBuffer()
  : input;

const meta = await sharp(source).metadata();
const nativeW = box ? Number(box[1]) : 854;
const scale = Math.min(1, nativeW / meta.width);

// Native-resolution softness: shrink to the panel's resolution and blow it back up.
const small = await sharp(source)
  .resize(Math.round(meta.width * scale), Math.round(meta.height * scale), { kernel: "cubic" })
  .png()
  .toBuffer();

const black = Math.round(25 + 70 * ambient);
const range = (235 - black) / 255;

await sharp(small)
  .resize(meta.width, meta.height, { kernel: "cubic" })
  .modulate({ saturation: 0.7, brightness: 0.92 })
  .linear(range, black)
  .blur(0.6)
  .png()
  .toFile(out);

console.log(out);
