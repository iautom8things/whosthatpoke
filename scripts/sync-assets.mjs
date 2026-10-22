// Copies one default-form SVG per species from pkmn_svgs into public/pokemon/{dex}.svg,
// optimized with svgo, and writes data/art-index.json and data/art-metrics.json.
//
// Source: PKMN_SVGS_DIR (default ../pkmn_svgs) when it has data/pokemon.json,
// else the published site (PKMN_SVGS_URL, default https://iautom8things.github.io/pkmn_svgs/).
//
// art-metrics.json, per dex:
//   w, h      viewBox size
//   aspect    w / h
//   bbox      [x, y, w, h] of pixels with alpha > 16, as fractions of the canvas
//   coverage  share of canvas pixels with alpha > 16
//   bytes     optimized file size
// Metrics come from a render at 512px on the long side.
//
// svgo runs in worker threads: multipass on the large Gen 8-9 files takes seconds each.
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import sharp from "sharp";
import { optimize } from "svgo";

const RENDER_PX = 512;
const ALPHA_MIN = 16;
const USER_AGENT = "whosthatpoke-research/0.1";

// Forms that never stand in for a species, even when listed first.
const NON_DEFAULT_FORM = /-(mega|primal|gmax|totem|alola|galar|hisui|paldea)(-|$)/;

// An <img> of an SVG with only a viewBox has no reliable natural size across browsers,
// and PokeArt reads naturalWidth/naturalHeight for the aspect. Give every root a size.
const ensureDimensions = {
  name: "ensureDimensions",
  fn: () => ({
    element: {
      enter(node, parent) {
        if (node.name !== "svg" || parent.type !== "root") return;
        const vb = node.attributes.viewBox?.trim().split(/[\s,]+/).map(Number);
        if (vb?.length !== 4) return;
        const round = (n) => String(Math.round(n * 100) / 100);
        node.attributes.width ??= round(vb[2]);
        node.attributes.height ??= round(vb[3]);
      },
    },
  }),
};

// svgo 4 already leaves removeViewBox out of preset-default, so the viewBox stays.
// cleanupNumericValues keeps 5 digits: several Gen 9 files put radial-gradient focal points
// (fx/fy) right on the gradient circle, and rounding them to 3 digits recolors whole regions.
const svgoConfig = {
  multipass: true,
  plugins: [
    {
      name: "preset-default",
      params: {
        overrides: {
          convertPathData: { floatPrecision: 2 },
          cleanupNumericValues: { floatPrecision: 5 },
        },
      },
    },
    ensureDimensions,
  ],
};

if (isMainThread) {
  await main();
} else {
  parentPort.on("message", ({ svg, path }) => {
    try {
      parentPort.postMessage({ data: optimize(svg, { ...svgoConfig, path }).data });
    } catch (err) {
      parentPort.postMessage({ error: `svgo: ${err.message}` });
    }
  });
}

async function main() {
  const root = new URL("..", import.meta.url).pathname;
  const localDir = process.env.PKMN_SVGS_DIR ?? join(root, "../pkmn_svgs");
  const remoteBase = (process.env.PKMN_SVGS_URL ?? "https://iautom8things.github.io/pkmn_svgs/").replace(/\/?$/, "/");
  const outDir = join(root, "public/pokemon");

  const local = existsSync(join(localDir, "data/pokemon.json"));
  const source = local
    ? { label: localDir, read: (rel) => readFile(join(localDir, rel)) }
    : { label: remoteBase, read: (rel) => fetchWithRetry(new URL(rel, remoteBase).href) };

  const species = JSON.parse(readFileSync(join(root, "data/species-names.json"), "utf8")).sort((a, b) => a.dex - b.dex);
  const rows = [...new Map(JSON.parse(await source.read("data/pokemon.json")).map((r) => [r.id, r])).values()];
  const rowsByDex = Map.groupBy(rows, (r) => r.dex);

  // The catalog names some form rows after the base form (id "386-attack" is "deoxys-normal",
  // "201-a" is "unown"), so the row whose id is the bare dex wins first.
  const defaultRow = (dex) => {
    const all = rowsByDex.get(dex) ?? [];
    const candidates = all.filter((r) => !NON_DEFAULT_FORM.test(r.name));
    const pool = candidates.length ? candidates : all;
    return pool.find((r) => r.id === String(dex)) ?? pool.find((r) => r.name === r.species) ?? pool[0] ?? null;
  };

  const syncOne = async (entry, optimizeSvg) => {
    const row = defaultRow(entry.dex);
    if (!row) return { dex: entry.dex, missing: "no row in catalog" };
    let original;
    try {
      original = await source.read(row.svg);
    } catch (err) {
      return { dex: entry.dex, missing: `read failed: ${err.message}` };
    }
    let svg;
    try {
      svg = await optimizeSvg(original.toString("utf8"), row.svg);
    } catch (err) {
      return { dex: entry.dex, missing: err.message };
    }
    const file = `pokemon/${entry.dex}.svg`;
    await writeFile(join(root, "public", file), svg);
    const { w, h } = viewBoxSize(svg);
    const artSource = row.artSource ?? (/\/dream-world\//.test(row.sourceUrl ?? "") ? "dream-world" : "unknown");
    return {
      dex: entry.dex,
      before: original.length,
      index: { file, form: row.name, artSource },
      metrics: {
        w,
        h,
        aspect: round4(w / h),
        ...(await measure(Buffer.from(svg))),
        source: artSource,
        bytes: Buffer.byteLength(svg),
      },
    };
  };

  await mkdir(outDir, { recursive: true });
  const started = Date.now();
  const workers = Array.from({ length: Math.min(8, availableParallelism()) }, () => new Worker(new URL(import.meta.url)));
  const results = new Array(species.length);
  let next = 0;
  try {
    await Promise.all(
      workers.map(async (worker) => {
        const optimizeSvg = (svg, path) => runOn(worker, { svg, path });
        while (next < species.length) {
          const i = next++;
          results[i] = await syncOne(species[i], optimizeSvg);
        }
      }),
    );
  } finally {
    await Promise.all(workers.map((w) => w.terminate()));
  }

  const artIndex = {};
  const artMetrics = {};
  const done = results.filter((r) => !r.missing);
  const missing = results.filter((r) => r.missing);
  for (const r of done) {
    artIndex[r.dex] = r.index;
    artMetrics[r.dex] = r.metrics;
  }

  // Drop art left over from an earlier run for a species that no longer has any.
  const keep = new Set(done.map((r) => `${r.dex}.svg`));
  for (const name of await readdir(outDir)) {
    if (/^\d+\.svg$/.test(name) && !keep.has(name)) await unlink(join(outDir, name));
  }

  const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(join(root, "data/art-index.json"), json(artIndex));
  await writeFile(join(root, "data/art-metrics.json"), json(artMetrics));

  const before = done.reduce((n, r) => n + r.before, 0);
  const after = done.reduce((n, r) => n + r.metrics.bytes, 0);
  const mb = (n) => `${(n / 1e6).toFixed(2)} MB`;
  const bySlug = new Map(species.map((s) => [s.dex, s]));
  const bySource = Object.groupBy(done, (r) => r.index.artSource);
  console.log(`source: ${source.label} (${local ? "local" : "remote"})`);
  console.log(`synced ${done.length}/${species.length} species in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log(`bytes: ${mb(before)} -> ${mb(after)} (${(100 - (after / before) * 100).toFixed(1)}% smaller)`);
  console.log(`art sources: ${Object.entries(bySource).map(([k, v]) => `${k} ${v.length}`).join(", ")}`);
  console.log("largest:");
  for (const r of [...done].sort((a, b) => b.metrics.bytes - a.metrics.bytes).slice(0, 10)) {
    console.log(`  ${String(r.dex).padStart(4)} ${bySlug.get(r.dex).name.padEnd(14)} ${(r.metrics.bytes / 1024).toFixed(0)} KB`);
  }
  const forms = done.filter((r) => r.index.form !== bySlug.get(r.dex).slug);
  if (forms.length) console.log(`non-base names used (${forms.length}): ${forms.map((r) => `${r.dex} ${r.index.form}`).join(", ")}`);
  console.log(missing.length ? `without art (${missing.length}):` : "without art: none");
  for (const m of missing) console.log(`  ${m.dex} ${bySlug.get(m.dex).name}: ${m.missing}`);
  if (missing.length) process.exitCode = 1;
}

function runOn(worker, message) {
  return new Promise((resolve, reject) => {
    const onMessage = (reply) => {
      worker.off("error", onError);
      reply.error ? reject(new Error(reply.error)) : resolve(reply.data);
    };
    const onError = (err) => {
      worker.off("message", onMessage);
      reject(err);
    };
    worker.once("message", onMessage);
    worker.once("error", onError);
    worker.postMessage(message);
  });
}

async function fetchWithRetry(url, attempts = 5) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      if ((res.status < 500 && res.status !== 429) || i >= attempts) {
        throw Object.assign(new Error(`HTTP ${res.status} for ${url}`), { final: true });
      }
    } catch (err) {
      if (err.final || i >= attempts) throw err;
    }
    await new Promise((r) => setTimeout(r, 500 * 2 ** (i - 1)));
  }
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

function viewBoxSize(svg) {
  const head = svg.match(/<svg\b[^>]*>/)?.[0] ?? "";
  const vb = head.match(/viewBox="([^"]+)"/)?.[1].trim().split(/[\s,]+/).map(Number);
  if (vb?.length === 4) return { w: vb[2], h: vb[3] };
  const num = (attr) => parseFloat(head.match(new RegExp(`\\s${attr}="([^"]+)"`))?.[1]);
  return { w: num("width"), h: num("height") };
}

async function measure(svg) {
  const meta = await sharp(svg).metadata();
  const scale = RENDER_PX / Math.max(meta.width, meta.height);
  const width = Math.max(1, Math.round(meta.width * scale));
  const height = Math.max(1, Math.round(meta.height * scale));
  const { data, info } = await sharp(svg, { density: 72 * scale })
    .resize(width, height, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let minX = width, minY = height, maxX = -1, maxY = -1, opaque = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * info.channels + 3] <= ALPHA_MIN) continue;
      opaque++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const bbox = opaque
    ? [minX / width, minY / height, (maxX - minX + 1) / width, (maxY - minY + 1) / height].map(round4)
    : [0, 0, 0, 0];
  return { bbox, coverage: round4(opaque / (width * height)) };
}
