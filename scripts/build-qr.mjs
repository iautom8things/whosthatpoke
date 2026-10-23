// Writes the play-at-home QR code: src/data/playQr.ts (the URL) and src/data/playQr.svg (the code as pop-art).
// The app inlines the SVG into its bundle, so the code shows offline and needs no encoder at runtime.
//   node scripts/build-qr.mjs
//
// The art is a halftone QR (Chu et al., SIGGRAPH Asia 2013). Each module is split into 5x5 sub-cells. The center
// 3x3 carry the module's value. The ring around them dithers Gengar over a yellow sunburst, and where the ring
// outvotes the module, a round dot in the module's value sits on the center. Finder eyes, timing, alignment and
// format modules stay solid. The art box and colors are tuned for this URL's 33x33 code. If the URL changes, retune
// them until src/ui/components/PlayQr.test.ts passes.
import { readFileSync, writeFileSync } from "node:fs";
import QRCode from "qrcode";
import sharp from "sharp";

const PLAY_URL = "https://iautom8things.github.io/whosthatpoke/";

const DEX = 94; // Gengar, from public/pokemon/94.svg
const K = 5; // sub-cells per module side
const C = 3; // center sub-cells per module side that carry the module's value
const QUIET = 4; // modules of quiet zone a side, drawn as sunburst
const ART = { size: 36, cx: 17.5, cy: 19.5 }; // art box in modules: longest side and center
const DOT = 1; // dot diameter in modules
const PX = 10; // SVG width and height per module
const INK = "#13072d";
const PAPER = "#ffffff";
// Each art color: the tone the dither aims for (0 dark, 1 light) and the sub-cell colors it draws dark and light.
// A scanner sees only light and dark, so every light color here reads lighter than every dark one.
const SHADES = {
  "#664497": { level: 0, dark: "#2a1650", light: "#d2c4f6" },
  "#593984": { level: 0, dark: "#211043", light: "#c6b6f0" },
  "#0d131a": { level: 0, dark: INK, light: "#e9e4f2" },
  "#e50020": { level: 1, dark: "#5e000c", light: "#ffb0bb" },
  "#ffffff": { level: 1, dark: "#2a1650", light: "#ffffff" },
};
// Behind the art: 14 pairs of rays, from the code's center out through the quiet zone.
const BURST = { rays: 14, light: ["#ffe35a", "#fff3c4"], dark: "#4a1b00" };

// --- the matrix ---------------------------------------------------------------------------------------------------
// Level Q (25% recovery) pays for the modules the art flips.
const qr = QRCode.create(PLAY_URL, { errorCorrectionLevel: "Q" });
const N = qr.modules.size;
const isDark = (x, y) => qr.modules.data[y * N + x] === 1;
const reserved = (x, y) => qr.modules.reservedBit[y * N + x] === 1;

// --- the sub-cell grid --------------------------------------------------------------------------------------------
const M = N + 2 * QUIET, G = M * K, c0 = (K - C) / 2;
// forced: -1 free, 0 dark, 1 light. kind: 0 quiet, 1 function, 2 data center, 3 data ring.
const forced = new Int8Array(G * G).fill(-1);
const kind = new Uint8Array(G * G);
for (let j = 0; j < G; j++) {
  for (let i = 0; i < G; i++) {
    const p = j * G + i, mx = Math.floor(i / K) - QUIET, my = Math.floor(j / K) - QUIET, u = i % K, v = j % K;
    if (mx < 0 || my < 0 || mx >= N || my >= N) { forced[p] = 1; kind[p] = 0; continue; }
    const val = isDark(mx, my) ? 0 : 1;
    if (reserved(mx, my)) { forced[p] = val; kind[p] = 1; continue; }
    const center = u >= c0 && u < c0 + C && v >= c0 && v < c0 + C;
    if (center) { forced[p] = val; kind[p] = 2; } else kind[p] = 3;
  }
}

// --- the picture, sampled per sub-cell ----------------------------------------------------------------------------
const hex = (s) => { s = s.replace("#", ""); if (s.length === 3) s = [...s].map((x) => x + x).join(""); return [0, 2, 4].map((o) => parseInt(s.slice(o, o + 2), 16)); };
const norm = (s) => "#" + hex(s).map((v) => v.toString(16).padStart(2, "0")).join("");
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
function oklab([r, g, b]) {
  r = lin(r); g = lin(g); b = lin(b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

const artSvg = readFileSync(new URL(`../public/pokemon/${DEX}.svg`, import.meta.url), "utf8");
// Entry 0 is the sunburst, wherever the art is transparent. The rest are the art's flat fills, matched by
// nearest color in OKLab so anti-aliased edges snap to a fill.
const fills = [...new Set([...artSvg.matchAll(/fill="(#[0-9a-fA-F]{3,6})"/g)].map((m) => norm(m[1])))];
const pal = [{ level: 1 }, ...fills.map((h) => SHADES[h] ?? fail(`no shades for ${h} in Pokémon ${DEX}`))];
const palLab = [null, ...fills.map((h) => oklab(hex(h)))];
function fail(msg) { throw new Error(msg); }

const S = 6; // samples per sub-cell side
const meta = await sharp(Buffer.from(artSvg)).metadata();
const scale = (ART.size * K * S) / Math.max(meta.width, meta.height);
const aw = Math.round(meta.width * scale), ah = Math.round(meta.height * scale);
const artPng = await sharp(Buffer.from(artSvg), { density: 72 * scale * 1.02 }).resize(aw, ah, { fit: "fill" }).png().toBuffer();
const left = Math.round((QUIET + ART.cx) * K * S - aw / 2), top = Math.round((QUIET + ART.cy) * K * S - ah / 2);
// Crop the art to the canvas so sharp accepts a box that overflows it.
const cl = Math.max(0, -left), ct = Math.max(0, -top);
const cw = Math.min(aw - cl, G * S - Math.max(0, left)), ch = Math.min(ah - ct, G * S - Math.max(0, top));
const piece = await sharp(artPng).extract({ left: cl, top: ct, width: cw, height: ch }).toBuffer();
const canvas = await sharp({ create: { width: G * S, height: G * S, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: piece, left: Math.max(0, left), top: Math.max(0, top) }])
  .ensureAlpha()
  .raw()
  .toBuffer();
const cache = new Map();
const nearest = (r, g, b, a) => {
  if (a < 128) return 0;
  const key = (r << 16) | (g << 8) | b;
  let n = cache.get(key);
  if (n === undefined) {
    const lab = oklab([r, g, b]);
    let bd = Infinity;
    for (let m = 1; m < pal.length; m++) {
      const q = palLab[m], d = (q[0] - lab[0]) ** 2 + (q[1] - lab[1]) ** 2 + (q[2] - lab[2]) ** 2;
      if (d < bd) { bd = d; n = m; }
    }
    cache.set(key, n);
  }
  return n;
};
// Per sub-cell: the mean tone the dither aims for, and the palette entry that covers most of it (its colors).
const L = new Float32Array(G * G), majority = new Int16Array(G * G);
const counts = new Int32Array(pal.length);
for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
  counts.fill(0);
  let sum = 0;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const q = ((j * S + y) * G * S + (i * S + x)) * 4, n = nearest(canvas[q], canvas[q + 1], canvas[q + 2], canvas[q + 3]);
    counts[n]++; sum += pal[n].level;
  }
  const p = j * G + i;
  L[p] = sum / (S * S);
  majority[p] = counts.indexOf(Math.max(...counts));
}

// --- dithering: serpentine Floyd-Steinberg; forced cells keep their value and pass on no error -------------------
const out = new Uint8Array(G * G);
const err = new Float32Array(G * G);
for (let j = 0; j < G; j++) {
  const ltr = j % 2 === 0;
  for (let n = 0; n < G; n++) {
    const i = ltr ? n : G - 1 - n, p = j * G + i;
    let e = 0;
    if (forced[p] >= 0) out[p] = forced[p];
    else {
      const t = L[p] + err[p];
      out[p] = t >= 0.5 ? 1 : 0;
      e = t - out[p];
    }
    const s = ltr ? 1 : -1;
    const push = (di, dj, w) => {
      const ii = i + di * s, jj = j + dj;
      if (ii >= 0 && ii < G && jj < G) err[jj * G + ii] += e * w;
    };
    push(1, 0, 7 / 16); push(-1, 1, 3 / 16); push(0, 1, 5 / 16); push(1, 1, 1 / 16);
  }
}

// --- round dots: each center takes its ring's majority, and a dot of the module's value sits on top ---------------
const dots = []; // [x, y, value, center sub-cell for its color]
for (let my = 0; my < N; my++) for (let mx = 0; mx < N; mx++) {
  if (reserved(mx, my)) continue;
  const i0 = (mx + QUIET) * K, j0 = (my + QUIET) * K;
  let light = 0, ring = 0;
  for (let v = 0; v < K; v++) for (let u = 0; u < K; u++) {
    const p = (j0 + v) * G + i0 + u;
    if (kind[p] === 3) { ring++; light += out[p]; }
  }
  const maj = light * 2 >= ring ? 1 : 0, val = isDark(mx, my) ? 0 : 1;
  for (let v = c0; v < c0 + C; v++) for (let u = c0; u < c0 + C; u++) out[(j0 + v) * G + i0 + u] = maj;
  if (maj !== val) dots.push([i0 + K / 2, j0 + K / 2, val, (j0 + c0) * G + i0 + c0]);
}

// --- colors per sub-cell ------------------------------------------------------------------------------------------
const ray = (i, j) => {
  const a = Math.atan2((j + 0.5) / K - QUIET - N / 2, (i + 0.5) / K - QUIET - N / 2) / (2 * Math.PI) + 1;
  return Math.floor(a * BURST.rays * 2) % 2;
};
const colorAt = (p, value = out[p]) => {
  const i = p % G, j = Math.floor(p / G);
  if (kind[p] <= 1) return value ? BURST.light[ray(i, j)] : INK;
  if (majority[p] === 0) return value ? BURST.light[ray(i, j)] : BURST.dark;
  const e = pal[majority[p]];
  return value ? e.light : e.dark;
};

// --- SVG: paper, every dark sub-cell in ink, then colored sub-cells on top (no light seams between darks) ----------
const colors = Array.from({ length: G * G }, (_, p) => colorAt(p));
const runs = new Map([["ink", []]]);
const addRun = (color, x, y, n) => { if (!runs.has(color)) runs.set(color, []); runs.get(color).push(`M${x} ${y}h${n}v1h-${n}z`); };
for (let j = 0; j < G; j++) {
  for (let i = 0; i < G;) {
    if (out[j * G + i]) { i++; continue; }
    let n = 1; while (i + n < G && !out[j * G + i + n]) n++;
    addRun("ink", i, j, n); i += n;
  }
  for (let i = 0; i < G;) {
    const col = colors[j * G + i];
    let n = 1; while (i + n < G && colors[j * G + i + n] === col) n++;
    if (col !== PAPER && col !== INK) addRun(col, i, j, n);
    i += n;
  }
}
const W = M * PX;
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${G} ${G}">`;
svg += `<rect width="${G}" height="${G}" fill="${PAPER}"/>`;
svg += `<path fill="${INK}" d="${runs.get("ink").join("")}"/>`;
for (const [col, r] of runs) if (col !== "ink") svg += `<path fill="${col}" d="${r.join("")}"/>`;
const r = (DOT * K) / 2, byCol = new Map();
for (const [x, y, val, pc] of dots) {
  const col = colorAt(pc, val);
  if (!byCol.has(col)) byCol.set(col, []);
  byCol.get(col).push(`M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`);
}
for (const [col, d] of byCol) svg += `<path fill="${col}" d="${d.join("")}"/>`;
svg += `</svg>\n`;

const svgOut = new URL("../src/data/playQr.svg", import.meta.url);
const tsOut = new URL("../src/data/playQr.ts", import.meta.url);
writeFileSync(svgOut, svg);
writeFileSync(
  tsOut,
  `// Generated by scripts/build-qr.mjs. Change the URL there and run it again.
export const PLAY_URL = ${JSON.stringify(PLAY_URL)};
`,
);
console.log(`version ${qr.version}, mask ${qr.maskPattern}, ${N}x${N} modules, ${dots.length} dots -> ${svgOut.pathname} (${(svg.length / 1024).toFixed(0)} KB)`);
