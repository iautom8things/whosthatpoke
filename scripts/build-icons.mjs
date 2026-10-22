// Renders the app icon (a Poké Ball with a big "?" on the spooky night sky) into
// public/icons/*.png and public/favicon.svg. Run after changing the design:
//   node scripts/build-icons.mjs
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = fileURLToPath(new URL("..", import.meta.url));
const OUTLINE = "#13072d";

/** Chunky "?" from the kit's IconQuestion path (24-unit grid, centered near 12,12). */
function questionMark(cx, cy, scale) {
  const t = `translate(${cx - 12 * scale} ${cy - 12.2 * scale}) scale(${scale})`;
  const hook = "M8.4 8.6a3.6 3.6 0 1 1 5.2 3.2c-1 .5-1.6 1.3-1.6 2.4v.6";
  return `
  <g transform="${t}" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="${hook}" stroke="${OUTLINE}" stroke-width="5.4" transform="translate(0 .55)"/>
    <circle cx="12" cy="19.4" r="2.7" fill="${OUTLINE}" transform="translate(0 .55)"/>
    <path d="${hook}" stroke="${OUTLINE}" stroke-width="5.4"/>
    <circle cx="12" cy="19.4" r="2.7" fill="${OUTLINE}"/>
    <path d="${hook}" stroke="#2a5bc4" stroke-width="3.9"/>
    <circle cx="12" cy="19.4" r="1.95" fill="#2a5bc4"/>
    <path d="${hook}" stroke="#ffcb05" stroke-width="2.5"/>
    <circle cx="12" cy="19.4" r="1.25" fill="#ffcb05"/>
  </g>`;
}

function ball(cx, cy, r) {
  const band = r * 0.15;
  return `
  <g transform="rotate(-14 ${cx} ${cy})">
    <circle cx="${cx}" cy="${cy + r * 0.06}" r="${r}" fill="${OUTLINE}" opacity="0.55"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#white)"/>
    <path d="M${cx - r} ${cy}A${r} ${r} 0 0 1 ${cx + r} ${cy}Z" fill="url(#red)"/>
    <ellipse cx="${cx - r * 0.42}" cy="${cy - r * 0.55}" rx="${r * 0.26}" ry="${r * 0.14}" transform="rotate(-32 ${cx - r * 0.42} ${cy - r * 0.55})" fill="#fff" opacity="0.55"/>
    <rect x="${cx - r}" y="${cy - band / 2}" width="${2 * r}" height="${band}" fill="${OUTLINE}"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${OUTLINE}" stroke-width="${r * 0.085}"/>
  </g>`;
}

const DEFS = `
  <defs>
    <radialGradient id="sky" cx="50%" cy="42%" r="72%">
      <stop offset="0" stop-color="#5b2a8c"/>
      <stop offset="0.5" stop-color="#2a1260"/>
      <stop offset="1" stop-color="#0a0420"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#ffd23f" stop-opacity="0.95"/>
      <stop offset="0.55" stop-color="#ff8a1f" stop-opacity="0.5"/>
      <stop offset="1" stop-color="#ff8a1f" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="rayFade" gradientUnits="userSpaceOnUse" cx="256" cy="260" r="380">
      <stop offset="0" stop-color="#ffb627" stop-opacity="0.55"/>
      <stop offset="0.7" stop-color="#ff8a1f" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#ff8a1f" stop-opacity="0"/>
    </radialGradient>
    <mask id="crescent">
      <rect width="512" height="512" fill="#fff"/>
      <circle cx="432" cy="80" r="36" fill="#000"/>
    </mask>
    <linearGradient id="red" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ff6b57"/>
      <stop offset="1" stop-color="#e01414"/>
    </linearGradient>
    <linearGradient id="white" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#d8d4ec"/>
    </linearGradient>
  </defs>`;

function rays(cx, cy, len, count = 16) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const a0 = (i / count) * Math.PI * 2;
    const a1 = a0 + Math.PI / count;
    const p = (a) => `${(cx + Math.cos(a) * len).toFixed(1)} ${(cy + Math.sin(a) * len).toFixed(1)}`;
    out.push(`M${cx} ${cy}L${p(a0)}L${p(a1)}Z`);
  }
  return `<path d="${out.join("")}" fill="url(#rayFade)"/>`;
}

function star(x, y, s, opacity = 1) {
  return `<path d="M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}Z" fill="#fff4c8" opacity="${opacity}"/>`;
}

/** Full-bleed square icon. `maskable` keeps the ball inside the 80% safe circle. */
function appIcon({ maskable }) {
  const cx = 256;
  const cy = maskable ? 256 : 262;
  const r = maskable ? 150 : 176;
  const moon = maskable
    ? ""
    : `<circle cx="414" cy="94" r="40" fill="#fff1b8" mask="url(#crescent)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${DEFS}
  <rect width="512" height="512" fill="url(#sky)"/>
  ${rays(cx, cy, 420)}
  <circle cx="${cx}" cy="${cy}" r="${r * 1.45}" fill="url(#glow)"/>
  ${moon}
  ${star(96, 92, 14)}${star(150, 46, 8, 0.8)}${star(462, 214, 9, 0.85)}${star(58, 300, 8, 0.7)}${star(452, 420, 11, 0.8)}
  ${ball(cx, cy, r)}
  ${questionMark(cx, cy - r * 0.02, r * 0.074)}
</svg>`;
}

/** Transparent favicon: just the ball and the "?". */
function favicon() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${DEFS}
  ${ball(32, 32, 28)}
  ${questionMark(32, 31.5, 2.15)}
</svg>`;
}

const minify = (svg) => svg.replace(/\n\s*/g, "").replace(/>\s+</g, "><");

async function png(svg, size, file) {
  await sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toFile(file);
}

await mkdir(`${root}public/icons`, { recursive: true });
const any = appIcon({ maskable: false });
const mask = appIcon({ maskable: true });
await png(any, 192, `${root}public/icons/icon-192.png`);
await png(any, 512, `${root}public/icons/icon-512.png`);
await png(mask, 512, `${root}public/icons/icon-512-maskable.png`);
await png(any, 180, `${root}public/icons/apple-touch-icon.png`);
await writeFile(`${root}public/favicon.svg`, minify(favicon()) + "\n");
console.log("icons written to public/icons and public/favicon.svg");
