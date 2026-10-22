#!/usr/bin/env node
// Approximates how a screenshot looks on a cheap projector in a dim driveway:
// low native resolution, lifted blacks, crushed contrast and weak saturation.
//
//   node qa/projector-sim.mjs <in.png> [out.png] [--ambient 0..1]
//
// --ambient raises the black level further, like porch lights spilling on the screen (default 0.35).
import sharp from "sharp";

const [input, maybeOut, ...rest] = process.argv.slice(2);
if (!input) {
  console.error("usage: node qa/projector-sim.mjs <in.png> [out.png] [--ambient 0..1]");
  process.exit(1);
}
const out = maybeOut && !maybeOut.startsWith("--") ? maybeOut : input.replace(/\.png$/, ".projector.png");
const ambientIdx = rest.indexOf("--ambient");
const ambient = ambientIdx >= 0 ? Number(rest[ambientIdx + 1]) : 0.35;

const meta = await sharp(input).metadata();
const nativeW = 854;
const scale = Math.min(1, nativeW / meta.width);

// Native-resolution softness: shrink to the panel's resolution and blow it back up.
const small = await sharp(input)
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
