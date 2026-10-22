// Measures every silhouette and writes data/silhouettes.json for build-catalog:
// - twins: pairs whose 48x48 masks overlap almost completely (IoU), so one can't be told from the other.
// - blobs: featureless shapes (area / convex hull area near 1: circles, eggs, clouds).
// Slow (renders ~1000 SVGs twice). Rerun only when the art changes.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const root = new URL("..", import.meta.url).pathname;
const catalog = JSON.parse(readFileSync(join(root, "src/data/catalog.json"), "utf8"));
const TWIN_IOU = 0.85;
const BLOB_SOLIDITY = 0.94;

async function alpha(file, n) {
  const { data } = await sharp(readFileSync(join(root, "public", file)), { density: 72, limitInputPixels: false })
    .resize(n, n, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .extractChannel(3)
    .raw()
    .toBuffer({ resolveWithObject: true });
  return data;
}

const MASK = 48;
const WORDS = Math.ceil((MASK * MASK) / 32);
async function mask(file) {
  const data = await alpha(file, MASK);
  const bits = new Uint32Array(WORDS);
  for (let i = 0; i < MASK * MASK; i++) if (data[i] > 127) bits[i >> 5] |= 1 << (i & 31);
  return bits;
}

const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
async function solidity(file) {
  const n = 96;
  const data = await alpha(file, n);
  const pts = [];
  let area = 0;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      if (data[y * n + x] > 127) {
        area++;
        pts.push([x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]);
      }
  if (area === 0) return 0;
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const lower = [];
  const upper = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop();
    lower.push(p);
  }
  for (const p of pts.slice().reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop();
    upper.push(p);
  }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  let doubled = 0;
  for (let i = 0; i < hull.length; i++) {
    const [x1, y1] = hull[i];
    const [x2, y2] = hull[(i + 1) % hull.length];
    doubled += x1 * y2 - x2 * y1;
  }
  return area / (Math.abs(doubled) / 2);
}

const pop = (x) => {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
};

const masks = [];
const blobs = [];
for (const m of catalog) {
  masks.push([m.dex, await mask(m.art)]);
  const s = await solidity(m.art);
  if (s >= BLOB_SOLIDITY) blobs.push({ dex: m.dex, name: m.name, solidity: Math.round(s * 1000) / 1000 });
}

const twins = [];
for (let i = 0; i < masks.length; i++) {
  const [da, a] = masks[i];
  for (let j = i + 1; j < masks.length; j++) {
    const [db, b] = masks[j];
    let inter = 0;
    let union = 0;
    for (let w = 0; w < WORDS; w++) {
      inter += pop(a[w] & b[w]);
      union += pop(a[w] | b[w]);
    }
    const iou = union ? inter / union : 0;
    if (iou >= TWIN_IOU) twins.push([da, db, Math.round(iou * 1000) / 1000]);
  }
}
twins.sort((x, y) => y[2] - x[2]);
blobs.sort((x, y) => y.solidity - x.solidity);

const out = {
  notes: `twins: silhouette pairs with mask IoU >= ${TWIN_IOU} at ${MASK}x${MASK}; never offered against each other. blobs: solidity >= ${BLOB_SOLIDITY}; kept out of Poké Ball and Great Ball answers.`,
  twins,
  blobs,
};
writeFileSync(join(root, "data/silhouettes.json"), JSON.stringify(out, null, 1) + "\n");
console.log(`silhouettes: ${twins.length} twin pairs, ${blobs.length} blobs (${blobs.map((b) => b.name).join(", ")})`);
