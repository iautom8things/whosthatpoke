// Sound lab at ?lab=audio: try every song, sfx and announcer voice, and render level measurements.
// Parents can also use it on the iPad to pin the announcer voice for that device.

import { useEffect, useState, type CSSProperties } from "react";
import type { SfxId, SongId } from "../audio";
import { engine, speech, unlockAll } from "../audio/live";
import { downloadWav, encodeWav, measure, renderSfx, renderSong, type Measurement } from "../audio/offline";
import { SFX_IDS } from "../audio/sfx";
import { SONG_NOTES } from "../audio/songs";
import { useSettings } from "../state/settings";

const SONG_IDS = Object.keys(SONG_NOTES) as SongId[];
const SONG_LABEL: Record<SongId, string> = {
  title: "Title",
  spooky: "Spooky",
  question: "Question",
  results: "Results",
  showcase: "Showcase",
};

const LINES = [
  "Who's that Pokémon?",
  "It's Pikachu!",
  "It's Gyara-dose!",
  "It's Bulba-saur!",
  "It's Jiggly-puff!",
  "Three in a row! You're on fire!",
  "Time's up!",
  "You won a big candy!",
];

interface Row extends Measurement {
  id: string;
  kind: "song" | "sfx";
  rawPeakDb: number;
}

const lab = {
  renderSong,
  renderSfx,
  measure,
  encodeWav,
  downloadWav,
  songIds: SONG_IDS,
  sfxIds: SFX_IDS,
  level: () => engine.level(),
  status: () => engine.status,
  engine,
};
declare global {
  interface Window {
    __wtpAudioLab?: typeof lab;
  }
}
if (typeof window !== "undefined") window.__wtpAudioLab = lab;

function useEngineStatus() {
  const [status, setStatus] = useState(engine.status);
  useEffect(() => {
    const id = setInterval(() => setStatus(engine.status), 250);
    return () => clearInterval(id);
  }, []);
  return status;
}

/** Live output meter, so you can see sound even with the iPad muted. */
function Meter() {
  const [db, setDb] = useState(-Infinity);
  useEffect(() => {
    let raf = 0;
    let shown = -Infinity;
    const loop = () => {
      const lvl = engine.level();
      const now = lvl > 0 ? 20 * Math.log10(lvl) : -Infinity;
      // Fast attack, slow fall, like a real VU meter. Only re-render on visible change.
      const next = now > shown ? now : Math.max(now, shown - 1.2);
      if (Math.abs(next - shown) > 0.4 || !Number.isFinite(next) !== !Number.isFinite(shown)) setDb(next);
      shown = next;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const pct = Number.isFinite(db) ? Math.max(0, Math.min(100, ((db + 60) / 60) * 100)) : 0;
  return (
    <div className="meter" role="meter" aria-label="Output level" aria-valuemin={-60} aria-valuemax={0} aria-valuenow={Math.round(Number.isFinite(db) ? db : -60)}>
      <div className="meter-fill" style={{ transform: `scaleX(${pct / 100})` }} />
      <span className="meter-label">{Number.isFinite(db) && db > -60 ? `${db.toFixed(0)} dB` : "silent"}</span>
    </div>
  );
}

function useVoices() {
  const [, bump] = useState(0);
  useEffect(() => speech.onVoicesChanged(() => bump((n) => n + 1)), []);
  // Hide the novelty voices (Zarvox and friends) from the picker.
  return { voices: speech.listVoices().filter((v) => v.score >= 0), current: speech.voiceName, preferred: speech.preferredVoice };
}

const fmt = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : "-inf");

export default function AudioLab() {
  const status = useEngineStatus();
  const { voices, current, preferred } = useVoices();
  const musicVolume = useSettings((s) => s.musicVolume);
  const sfxVolume = useSettings((s) => s.sfxVolume);
  const voice = useSettings((s) => s.voice);
  const update = useSettings((s) => s.update);
  const [flash, setFlash] = useState<string | null>(null);
  const [text, setText] = useState("It's Gyara-dose!");
  const [speaking, setSpeaking] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [measuring, setMeasuring] = useState(false);

  useEffect(() => {
    document.title = "Sound Lab";
  }, []);

  const ping = (key: string) => {
    setFlash(key);
    setTimeout(() => setFlash((f) => (f === key ? null : f)), 220);
  };
  const playSfx = (id: SfxId) => {
    engine.sfx(id);
    ping(id);
  };
  const say = async (line: string) => {
    setSpeaking(true);
    await speech.say(line);
    setSpeaking(false);
  };

  const measureAll = async () => {
    setMeasuring(true);
    const out: Row[] = [];
    try {
      for (const id of SONG_IDS) {
        const buf = await renderSong(id, 20);
        const raw = measure(await renderSong(id, 20, { chain: false }));
        out.push({ id, kind: "song", ...measure(buf), rawPeakDb: raw.peakDb });
        setRows([...out]);
      }
      for (const id of SFX_IDS) {
        const buf = await renderSfx(id);
        const raw = measure(await renderSfx(id, undefined, { chain: false }));
        out.push({ id, kind: "sfx", ...measure(buf), rawPeakDb: raw.peakDb });
        setRows([...out]);
      }
    } finally {
      setMeasuring(false);
    }
  };

  const download = async (row: Row) => {
    const buf = row.kind === "song" ? await renderSong(row.id as SongId, 20) : await renderSfx(row.id as SfxId);
    downloadWav(buf, `${row.kind}-${row.id}.wav`);
  };

  const locked = !engine.unlocked;

  return (
    <div className="lab">
      <style>{CSS}</style>
      <header className="lab-head">
        <h1>Sound Lab</h1>
        <div className="lab-pills" aria-live="polite">
          <span className={`pill ${status.state === "running" ? "ok" : "warn"}`}>Audio: {status.state}</span>
          <span className="pill">Song: {status.song ?? status.pending ?? "none"}</span>
          <span className={`pill ${status.ducked ? "warn" : ""}`}>{status.ducked ? "Ducked" : "Not ducked"}</span>
          <span className="pill">Voice: {speech.supported ? (current ?? "loading…") : "unsupported"}</span>
        </div>
      </header>

      <div className="unlock-row">
        <button className={`btn primary unlock ${locked ? "" : "done"}`} onClick={() => void unlockAll()}>
          {locked ? "Tap to turn sound on" : "Sound is on"}
        </button>
        <Meter />
      </div>

      <section>
        <div className="row spread">
          <h2>Music</h2>
          <button className="btn" onClick={() => engine.stopSong(600)}>
            Stop music
          </button>
        </div>
        <div className="grid songs">
          {SONG_IDS.map((id) => (
            <button
              key={id}
              className={`btn song ${status.song === id ? "active" : ""}`}
              aria-pressed={status.song === id}
              onClick={() => engine.playSong(id)}
            >
              <span className="song-name">{SONG_LABEL[id]}</span>
              <span className="song-note">{SONG_NOTES[id]}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>Sound effects</h2>
        <div className="grid sfx">
          {SFX_IDS.map((id) => (
            <button key={id} className={`btn fx ${flash === id ? "flash" : ""}`} onClick={() => playSfx(id)}>
              {id}
            </button>
          ))}
        </div>
      </section>

      <section className="two">
        <div>
          <h2>Volume</h2>
          <Slider label="Music" value={musicVolume} onChange={(v) => update({ musicVolume: v })} />
          <Slider label="Sound effects" value={sfxVolume} onChange={(v) => update({ sfxVolume: v })} />
          <div className="row">
            <button className={`btn toggle ${voice ? "active" : ""}`} aria-pressed={voice} onClick={() => update({ voice: !voice })}>
              Announcer {voice ? "on" : "off"}
            </button>
            <button
              className={`btn toggle ${status.ducked ? "active" : ""}`}
              aria-pressed={status.ducked}
              onClick={() => engine.duck(!status.ducked)}
            >
              Duck music
            </button>
          </div>
        </div>

        <div>
          <h2>Announcer</h2>
          <div className="lines">
            {LINES.map((line) => (
              <button key={line} className="btn line" onClick={() => void say(line)}>
                {line}
              </button>
            ))}
          </div>
          <form
            className="row say"
            onSubmit={(e) => {
              e.preventDefault();
              void say(text);
            }}
          >
            <input value={text} onChange={(e) => setText(e.target.value)} aria-label="Line to say" />
            <button className="btn primary" type="submit">
              {speaking ? "Speaking…" : "Say it"}
            </button>
            <button className="btn" type="button" onClick={() => speech.cancel()}>
              Hush
            </button>
          </form>
          <label className="voice-pick">
            <span>Voice on this device</span>
            <select value={preferred ?? ""} onChange={(e) => speech.setPreferredVoice(e.target.value || null)}>
              <option value="">Automatic ({current ?? "none yet"})</option>
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} · {v.lang}
                  {v.local ? "" : " · online"} · score {v.score}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section>
        <div className="row spread">
          <h2>Levels</h2>
          <button className="btn primary" disabled={measuring} onClick={() => void measureAll()}>
            {measuring ? `Rendering… ${rows.length}/${SONG_IDS.length + SFX_IDS.length}` : "Render and measure all"}
          </button>
        </div>
        <p className="hint">
          Offline renders through the real engine at full volume: songs 20 s, sfx to their tail. Peak must stay under -0.2 dBFS
          (0.98). "Raw" is the mix before the master chain.
        </p>
        {rows.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Sound</th>
                  <th>Peak dB</th>
                  <th>Raw peak dB</th>
                  <th>RMS dB</th>
                  <th>Loudest 400 ms</th>
                  <th>Active s</th>
                  <th>WAV</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.kind + r.id} className={r.peak >= 0.98 || r.loudDb < -45 ? "bad" : ""}>
                    <td>
                      <span className="kind">{r.kind}</span> {r.id}
                    </td>
                    <td>{fmt(r.peakDb)}</td>
                    <td>{fmt(r.rawPeakDb)}</td>
                    <td>{fmt(r.rmsDb)}</td>
                    <td>{fmt(r.loudDb)}</td>
                    <td>{r.activeSec.toFixed(1)}</td>
                    <td>
                      <button className="btn mini" onClick={() => void download(r)}>
                        Save
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange(v: number): void }) {
  return (
    <label className="slider" style={{ "--v": value } as CSSProperties}>
      <span>
        {label} <b>{Math.round(value * 100)}%</b>
      </span>
      <input type="range" min={0} max={1} step={0.05} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

const CSS = `
.lab {
  --bg: #120c2b; --panel: #1f1745; --panel-2: #2a2060; --ink: #fff7e8; --muted: #c9bfe8;
  --accent: #ff8a1f; --accent-ink: #1a0f00; --ok: #4ade80; --warn: #fbbf24; --line: #3b2f7a;
  height: 100%; overflow-y: auto; box-sizing: border-box; background: var(--bg); color: var(--ink);
  font-family: "Fredoka Variable", system-ui, sans-serif; font-size: 18px;
  padding: 24px max(16px, env(safe-area-inset-right)) 48px max(16px, env(safe-area-inset-left));
}
.lab *, .lab *::before, .lab *::after { box-sizing: border-box; }
.lab > * { max-width: 1180px; margin-left: auto; margin-right: auto; }
.lab h1, .lab h2 { font-family: "Luckiest Guy", system-ui, sans-serif; font-weight: 400; letter-spacing: 0.02em; margin: 0; }
.lab h1 { font-size: clamp(36px, 6vw, 56px); color: var(--accent); text-shadow: 0 4px 0 #6b2a00; }
.lab h2 { font-size: 28px; margin: 28px 0 12px; }
.lab-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px 24px; }
.lab-pills { display: flex; flex-wrap: wrap; gap: 8px; }
.pill { background: var(--panel); border: 2px solid var(--line); border-radius: 999px; padding: 6px 14px; font-size: 15px; color: var(--muted); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pill.ok { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 50%, var(--line)); }
.pill.warn { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 50%, var(--line)); }
.btn {
  font: inherit; font-weight: 600; color: var(--ink); background: var(--panel-2); border: 3px solid var(--line);
  border-radius: 18px; min-height: 64px; padding: 10px 18px; cursor: pointer; touch-action: manipulation;
  box-shadow: 0 5px 0 #0b0720; transition: transform 80ms ease, box-shadow 80ms ease, background 120ms ease;
  -webkit-tap-highlight-color: transparent;
}
.btn:active { transform: translateY(4px); box-shadow: 0 1px 0 #0b0720; }
.btn:focus-visible { outline: 4px solid var(--warn); outline-offset: 3px; }
.btn:disabled { opacity: 0.6; cursor: progress; }
.btn.primary { background: var(--accent); color: var(--accent-ink); border-color: #ffb36b; box-shadow: 0 5px 0 #8a3d00; }
.btn.active { background: #3d2f8f; border-color: var(--accent); }
.unlock-row { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 14px; margin-top: 20px; }
.unlock { min-height: 84px; font-size: 26px; font-family: "Luckiest Guy", system-ui, sans-serif; font-weight: 400; letter-spacing: 0.03em; text-align: center; }
.meter { position: relative; min-height: 84px; border-radius: 18px; background: var(--panel); border: 3px solid var(--line); overflow: hidden; }
.meter-fill { position: absolute; inset: 0; transform-origin: left center; background: linear-gradient(90deg, #22c55e 0%, #a3e635 60%, #fbbf24 85%, #f97316 100%); opacity: 0.85; }
.meter-label { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); padding: 4px 12px; border-radius: 999px; background: rgba(11, 7, 32, 0.82); font-weight: 700; font-size: 18px; color: var(--ink); font-variant-numeric: tabular-nums; }
.unlock.done { background: var(--panel-2); color: var(--ok); border-color: color-mix(in srgb, var(--ok) 40%, var(--line)); box-shadow: 0 5px 0 #0b0720; }
.grid { display: grid; gap: 14px; }
.songs { grid-template-columns: repeat(auto-fill, minmax(min(100%, 210px), 1fr)); }
.sfx { grid-template-columns: repeat(auto-fill, minmax(min(100%, 150px), 1fr)); }
.song { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; text-align: left; min-height: 120px; }
.song-name { font-family: "Luckiest Guy", system-ui, sans-serif; font-weight: 400; font-size: 26px; letter-spacing: 0.02em; }
.song-note { font-size: 15px; font-weight: 500; color: var(--muted); line-height: 1.3; }
.song.active .song-name { color: var(--accent); }
.fx.flash { background: var(--accent); color: var(--accent-ink); }
.two { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr)); gap: 0 32px; }
.slider { display: grid; gap: 8px; margin-bottom: 18px; }
.slider span { color: var(--muted); }
.slider b { color: var(--ink); }
.slider input { -webkit-appearance: none; appearance: none; width: 100%; height: 48px; margin: 0; background: transparent; touch-action: none; }
.slider input::-webkit-slider-runnable-track { height: 14px; border-radius: 999px; background: linear-gradient(90deg, var(--accent) calc(var(--v) * 100%), var(--panel-2) 0); border: 2px solid var(--line); }
.slider input::-moz-range-track { height: 14px; border-radius: 999px; background: linear-gradient(90deg, var(--accent) calc(var(--v) * 100%), var(--panel-2) 0); border: 2px solid var(--line); }
.slider input::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 40px; height: 40px; margin-top: -15px; border-radius: 50%; background: var(--ink); border: 4px solid var(--accent); box-shadow: 0 3px 0 #0b0720; }
.slider input::-moz-range-thumb { width: 32px; height: 32px; border-radius: 50%; background: var(--ink); border: 4px solid var(--accent); }
.slider input:focus-visible { outline: 4px solid var(--warn); outline-offset: 2px; border-radius: 12px; }
.row { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
.row.spread { justify-content: space-between; }
.row.spread { margin: 28px 0 12px; }
.row.spread h2 { margin: 0; }
.lines { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; }
.line { min-height: 56px; font-size: 16px; }
.say input { flex: 1 1 220px; min-width: 0; min-height: 64px; font: inherit; color: var(--ink); background: var(--panel); border: 3px solid var(--line); border-radius: 16px; padding: 0 16px; }
.voice-pick { display: grid; gap: 8px; margin-top: 16px; color: var(--muted); }
.voice-pick select { -webkit-appearance: none; appearance: none; min-height: 60px; font: inherit; font-size: 17px; color: var(--ink); border: 3px solid var(--line); border-radius: 16px; padding: 0 48px 0 16px; max-width: 100%; text-overflow: ellipsis;
  background: var(--panel) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='12' viewBox='0 0 20 12'%3E%3Cpath d='M2 2l8 8 8-8' fill='none' stroke='%23ff8a1f' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") no-repeat right 16px center; }
.voice-pick select:focus-visible, .say input:focus-visible { outline: 4px solid var(--warn); outline-offset: 2px; }
.hint { color: var(--muted); font-size: 15px; margin: 10px 0 14px; }
.table-wrap { overflow-x: auto; border: 2px solid var(--line); border-radius: 16px; }
.lab table { width: 100%; border-collapse: collapse; font-size: 16px; font-variant-numeric: tabular-nums; }
.lab th, .lab td { padding: 8px 12px; text-align: right; border-bottom: 1px solid var(--line); white-space: nowrap; }
.lab th:first-child, .lab td:first-child { text-align: left; }
.lab th { background: var(--panel); color: var(--muted); font-weight: 600; position: sticky; top: 0; }
.lab tr.bad td { color: #fca5a5; }
.kind { display: inline-block; min-width: 3.2em; color: var(--muted); font-size: 13px; text-transform: uppercase; }
.btn.mini { min-height: 40px; padding: 4px 12px; border-radius: 12px; font-size: 15px; box-shadow: 0 3px 0 #0b0720; }
@media (max-width: 560px) {
  .unlock-row { grid-template-columns: 1fr; }
  .meter { min-height: 48px; }
  .song { min-height: 0; }
  .say input { flex: 1 1 100%; }
  .say .btn { flex: 1 1 0; text-align: center; }
}
@media (prefers-reduced-motion: reduce) { .btn { transition: none; } .btn:active { transform: none; } }
:root[data-reduce-motion="on"] .btn { transition: none; }
`;
