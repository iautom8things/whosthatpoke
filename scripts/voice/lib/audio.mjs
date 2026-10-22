// ffmpeg helpers for the voice pipeline. Each runs one ffmpeg or ffprobe process and resolves with its output.
import { spawn } from "node:child_process";

export function run(bin, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${bin} exited ${code}: ${stderr.slice(-400)}`)),
    );
  });
}

export const ffmpeg = (args) => run("ffmpeg", ["-hide_banner", "-nostdin", "-y", "-v", "info", ...args]);

/** Seconds, from the container. */
export async function duration(file) {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return Number(stdout.trim());
}

/**
 * Integrated loudness in LUFS and sample peak in dBFS, as decoded. Clips under 1.2 s are measured looped
 * three times, because the 400 ms gating blocks need room, and a looped clip has the same loudness.
 */
export async function levels(file, seconds) {
  const loop = seconds !== undefined && seconds < 1.2 ? ["-stream_loop", "2"] : [];
  const { stderr } = await run("ffmpeg", ["-hide_banner", "-nostats", ...loop, "-i", file, "-af", "ebur128=peak=sample", "-f", "null", "-"]);
  const summary = stderr.slice(stderr.lastIndexOf("Summary:"));
  const lufs = Number(summary.match(/I:\s+(-?[\d.]+) LUFS/)?.[1]);
  const peak = Number(summary.match(/Peak:\s+(-?[\d.]+) dBFS/)?.[1]);
  if (!Number.isFinite(lufs) || lufs <= -69) throw new Error(`no loudness for ${file}`);
  return { lufs, peak };
}

/** Pauses of at least `minSec` below `db`, as [{ start, end }], plus the clip length. */
export async function silences(file, db, minSec) {
  const { stderr } = await run("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", `silencedetect=noise=${db}dB:d=${minSec}`, "-f", "null", "-"]);
  const total = await duration(file);
  const out = [];
  let start = null;
  for (const line of stderr.split("\n")) {
    const s = line.match(/silence_start: (-?[\d.]+)/);
    const e = line.match(/silence_end: (-?[\d.]+)/);
    if (s) start = Math.max(0, Number(s[1]));
    if (e && start !== null) {
      out.push({ start, end: Number(e[1]) });
      start = null;
    }
  }
  if (start !== null) out.push({ start, end: total });
  return { silences: out, total };
}

/** Copies [from, to) seconds of a WAV to a new 16-bit WAV. */
export const cut = (file, from, to, out) =>
  ffmpeg(["-i", file, "-ss", from.toFixed(3), "-to", to.toFixed(3), "-c:a", "pcm_s16le", out]);

/**
 * Trims only the two ends (the areverse trick from notes.md section 11, which keeps the pause inside
 * "It's ... Gyarados!"), leaving `leadMs` and `tailMs` of the quiet, with tiny fades so a cut never clicks.
 */
export const trimChain = ({ trimDb, leadMs, tailMs }) =>
  [
    `silenceremove=start_periods=1:start_threshold=${trimDb}dB:start_silence=${leadMs / 1000}`,
    "afade=t=in:d=0.005",
    "areverse",
    `silenceremove=start_periods=1:start_threshold=${trimDb}dB:start_silence=${tailMs / 1000}`,
    "afade=t=in:d=0.01",
    "areverse",
  ].join(",");
