#!/usr/bin/env node
// Screenshot every registered demo on every device preset, one device at a time, so a run never
// holds more than one browser open.
//
//   node qa/capture.mjs --url http://localhost:5173 --out /tmp/shots \
//     [--devices ipad-landscape,projector-480] [--demos game-asking,results-big-candy] \
//     [--themes spooky,classic] [--projector off,on] [--wait 1500] [--session-prefix me]
//
// Writes <out>/<device>/<demo>--<theme>[--projector].png and <out>/manifest.json.
// Demos come from registerDemo("...") calls in src/dev/demos/*.ts. Game demos get &hold=1, so
// their clocks are frozen and shots compare across devices.
//
// Each run opens its own browser sessions (<prefix>-<n>), so parallel runs by different agents
// never share or close each other's browsers. macOS caps socket paths, so names stay short.
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = new URL("..", import.meta.url).pathname;

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  const lines = readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1);
  const header = lines.slice(0, lines.findIndex((l) => !l.startsWith("//")));
  console.log(header.map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
  process.exit(0);
}

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, all) => {
    if (arg.startsWith("--")) pairs.push([arg.slice(2), all[i + 1]]);
    return pairs;
  }, []),
);
const list = (value, fallback) => (value ? value.split(",").filter(Boolean) : fallback);

const allDevices = readdirSync(join(root, "qa/playwright")).map((f) => f.replace(/\.json$/, ""));
const allDemos = readdirSync(join(root, "src/dev/demos"))
  .filter((f) => f.endsWith(".ts"))
  .flatMap((f) => [...readFileSync(join(root, "src/dev/demos", f), "utf8").matchAll(/registerDemo\(\s*["'`]([^"'`]+)["'`]/g)].map((m) => m[1]));

const url = args.url ?? "http://localhost:5173";
const out = resolve(args.out ?? join(root, "qa/out"));
const devices = list(args.devices, ["phone-portrait", "ipad-landscape", "projector-480", "projector-720"]);
const demos = list(args.demos, allDemos);
const themes = list(args.themes, ["spooky"]);
const projector = list(args.projector, ["off"]);
const wait = Number(args.wait ?? 1500);
const prefix = args["session-prefix"] ?? `wtp${process.pid.toString(36)}`;
const SHOT_TIMEOUT_MS = 30_000;

const unknown = devices.filter((d) => !allDevices.includes(d));
if (unknown.length) throw new Error(`Unknown devices: ${unknown.join(", ")}. Known: ${allDevices.join(", ")}`);

// playwright-cli writes its snapshot files into the cwd, so it runs in `out`, not the repo.
mkdirSync(out, { recursive: true });
const cli = (session, ...rest) => run("playwright-cli", [`-s=${session}`, ...rest], { cwd: out, maxBuffer: 1 << 24 });

const written = (file) => existsSync(file) && statSync(file).size > 0;

async function shoot(session, target, file) {
  await cli(session, "goto", target);
  await cli(
    session,
    "run-code",
    `async page => { await page.waitForTimeout(${wait}); await page.screenshot({ path: ${JSON.stringify(file)}, timeout: ${SHOT_TIMEOUT_MS} }); }`,
  );
  if (!written(file)) throw new Error(`no screenshot written to ${file}`);
}

async function captureDevice(device, index) {
  const session = `${prefix}-${index}`;
  if (session.length > 16) throw new Error(`session name ${session} is too long for the macOS socket path; pass a shorter --session-prefix`);
  const shots = [];
  mkdirSync(join(out, device), { recursive: true });
  try {
    await cli(session, "open", `--config=${join(root, "qa/playwright", `${device}.json`)}`, "about:blank");
  } catch (err) {
    // Recorded, not thrown, so the other devices still run and the manifest says why.
    await cli(session, "close").catch(() => {});
    return [{ device, demo: null, theme: null, projector: null, file: null, errors: [`open failed: ${String(err.message ?? err).slice(0, 300)}`] }];
  }
  try {
    for (const demo of demos) {
      for (const theme of themes) {
        for (const proj of projector) {
          const name = `${demo}--${theme}${proj === "on" ? "--projector" : ""}`;
          const file = join(out, device, `${name}.png`);
          const hold = demo.startsWith("game-") ? "&hold=1" : "";
          const target = `${url}/?demo=${encodeURIComponent(demo)}&theme=${theme}&projector=${proj}${hold}`;
          const errors = [];
          rmSync(file, { force: true }); // a shot left from an earlier run must not count
          // One retry: under load a shot can time out waiting for fonts.
          for (let attempt = 0; attempt < 2 && !written(file); attempt++) {
            try {
              await shoot(session, target, file);
            } catch (err) {
              errors.push(String(err.message ?? err).slice(0, 300));
            }
          }
          if (written(file)) {
            const { stdout } = await cli(session, "console", "error").catch(() => ({ stdout: "" }));
            const pageErrors = stdout.split("\n").filter((l) => /\[error\]/i.test(l));
            shots.push({ device, demo, theme, projector: proj, file, errors: pageErrors, retried: errors.length > 0 });
          } else {
            shots.push({ device, demo, theme, projector: proj, file: null, errors });
          }
        }
      }
    }
  } finally {
    await cli(session, "close").catch(() => {});
  }
  return shots;
}

const results = [];
for (const [i, device] of devices.entries()) results.push(...(await captureDevice(device, i)));
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "manifest.json"), JSON.stringify({ url, devices, demos, themes, projector, results }, null, 2));
const failed = results.filter((r) => !r.file || r.errors.length);
console.log(`${results.length} shots in ${out} (${failed.length} with errors)`);
for (const f of failed) console.log(`  ${f.device} ${f.demo} ${f.theme}: ${f.errors.join(" | ").slice(0, 200)}`);
