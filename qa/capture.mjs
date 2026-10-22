#!/usr/bin/env node
// Screenshot every registered demo on every device preset, in parallel per device.
//
//   node qa/capture.mjs --url http://localhost:5173 --out /tmp/shots \
//     [--devices ipad-landscape,projector-480] [--demos game-asking,results-big-candy] \
//     [--themes spooky,classic] [--projector off,on] [--wait 1500]
//
// Writes <out>/<device>/<demo>--<theme>[--projector].png and <out>/manifest.json.
// Demos come from registerDemo("...") calls in src/dev/demos/*.ts.
import { execFile } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = new URL("..", import.meta.url).pathname;

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
const out = args.out ?? join(root, "qa/out");
const devices = list(args.devices, ["phone-portrait", "ipad-landscape", "projector-480", "projector-720"]);
const demos = list(args.demos, allDemos);
const themes = list(args.themes, ["spooky"]);
const projector = list(args.projector, ["off"]);
const wait = Number(args.wait ?? 1500);

const unknown = devices.filter((d) => !allDevices.includes(d));
if (unknown.length) throw new Error(`Unknown devices: ${unknown.join(", ")}. Known: ${allDevices.join(", ")}`);

const cli = (session, ...rest) => run("playwright-cli", [`-s=${session}`, ...rest], { cwd: root, maxBuffer: 1 << 24 });

async function captureDevice(device) {
  const session = `wtp-capture-${device}`;
  const shots = [];
  mkdirSync(join(out, device), { recursive: true });
  await cli(session, "open", `--config=qa/playwright/${device}.json`, "about:blank");
  try {
    for (const demo of demos) {
      for (const theme of themes) {
        for (const proj of projector) {
          const name = `${demo}--${theme}${proj === "on" ? "--projector" : ""}`;
          const file = join(out, device, `${name}.png`);
          const target = `${url}/?demo=${encodeURIComponent(demo)}&theme=${theme}&projector=${proj}`;
          try {
            await cli(session, "goto", target);
            await cli(session, "run-code", `async page => { await page.waitForTimeout(${wait}); }`);
            await cli(session, "screenshot", `--filename=${file}`);
            const { stdout } = await cli(session, "console", "error");
            const errors = stdout.split("\n").filter((l) => /\[error\]/i.test(l));
            shots.push({ device, demo, theme, projector: proj, file, errors });
          } catch (err) {
            shots.push({ device, demo, theme, projector: proj, file: null, errors: [String(err.message ?? err)] });
          }
        }
      }
    }
  } finally {
    await cli(session, "close").catch(() => {});
  }
  return shots;
}

const results = (await Promise.all(devices.map(captureDevice))).flat();
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "manifest.json"), JSON.stringify({ url, devices, demos, themes, projector, results }, null, 2));
const failed = results.filter((r) => !r.file || r.errors.length);
console.log(`${results.length} shots in ${out} (${failed.length} with errors)`);
for (const f of failed) console.log(`  ${f.device} ${f.demo} ${f.theme}: ${f.errors.join(" | ").slice(0, 200)}`);
