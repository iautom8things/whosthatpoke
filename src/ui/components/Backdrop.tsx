import { memo, useSyncExternalStore, type CSSProperties } from "react";
import { useNav, type Screen } from "../../state/nav";
import { useSettings } from "../../state/settings";
import s from "./Backdrop.module.css";

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One element per layer; every star is a box-shadow, so a layer twinkles with a single opacity animation. */
function starField(count: number, seed: number, maxY: number, warm = 0.2): string {
  const rnd = mulberry32(seed);
  return Array.from({ length: count }, () => {
    const x = (rnd() * 100).toFixed(2);
    const y = (rnd() * maxY).toFixed(2);
    const color = rnd() < warm ? "#ffe9a8" : "#ffffff";
    return `${x}vw ${y}vh 0 ${color}`;
  }).join(", ");
}

const STARS = [starField(70, 7, 70), starField(36, 21, 62), starField(16, 42, 55, 0.4)];

function subscribeVisibility(cb: () => void) {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
}
const isHidden = () => document.visibilityState === "hidden";

/** Screens with live HUD: no moon behind it, and no pumpkins under the bottom band where it crowds. */
const HUD: Partial<Record<Screen, "play" | "results">> = { game: "play", host: "play", showcase: "play", results: "results", leaderboard: "results" };

const SPARKLE = "M12 0C13 8 16 11 24 12C16 13 13 16 12 24C11 16 8 13 0 12C8 11 11 8 12 0Z";

function Sparkle({ style }: { style: CSSProperties }) {
  return (
    <svg className={s.sparkle} style={style} viewBox="0 0 24 24">
      <path d={SPARKLE} />
    </svg>
  );
}

function Bat({ className }: { className: string }) {
  return (
    <div className={`${s.bat} ${className}`}>
      <svg className={s.batBob} viewBox="0 0 100 60">
        <path className={s.wing} d="M45 27C37 15 20 10 3 17c6 4 8 10 6 17 6-4 12-2 14 4 4-6 10-6 14 0 2-6 5-7 8-5z" />
        <g transform="translate(100 0) scale(-1 1)">
          <path className={s.wing} d="M45 27C37 15 20 10 3 17c6 4 8 10 6 17 6-4 12-2 14 4 4-6 10-6 14 0 2-6 5-7 8-5z" />
        </g>
        <ellipse cx="50" cy="34" rx="9" ry="12" />
        <circle cx="50" cy="22" r="8.5" />
        <path d="M42.5 18 44 5.5 49 14zM57.5 18 56 5.5 51 14z" />
        <circle className={s.eye} cx="46.6" cy="21.5" r="2.1" />
        <circle className={s.eye} cx="53.4" cy="21.5" r="2.1" />
      </svg>
    </div>
  );
}

function Pumpkin({ style }: { style: CSSProperties }) {
  return (
    <div className={s.pumpkin} style={style}>
      <div className={s.pumpkinGlow} />
      <svg viewBox="0 0 64 54">
        <path d="M30 9c0-4 1-7 4-8l3 2c-2 1-3 3-3 6z" fill="#3f7d2a" />
        <ellipse cx="18" cy="32" rx="14" ry="19" fill="#e86b00" />
        <ellipse cx="46" cy="32" rx="14" ry="19" fill="#e86b00" />
        <ellipse cx="32" cy="31" rx="15" ry="21" fill="#ff8a1f" />
        <path className={s.face} d="M20 28 25.5 19 31 28zM33 28 38.5 19 44 28zM17 33Q32 49 47 33Q32 41 17 33z" />
      </svg>
    </div>
  );
}

function Spooky() {
  return (
    <>
      <div className={s.nightSky} />
      <div className={`${s.stars} ${s.stars1}`} style={{ boxShadow: STARS[0] }} />
      <div className={`${s.stars} ${s.stars2}`} style={{ boxShadow: STARS[1] }} />
      <div className={`${s.stars} ${s.stars3}`} style={{ boxShadow: STARS[2] }} />
      <Sparkle style={{ left: "14vw", top: "12vh", animationDelay: "-1s" }} />
      <Sparkle style={{ left: "44vw", top: "7vh", animationDelay: "-2.6s", width: "2.2vmin" }} />
      <Sparkle style={{ left: "64vw", top: "30vh", animationDelay: "-0.4s", width: "1.8vmin" }} />
      <Sparkle style={{ left: "28vw", top: "40vh", animationDelay: "-3.3s", width: "1.6vmin" }} />
      <div className={s.moonWrap}>
        <div className={s.moonHalo} />
        <div className={s.moon} />
      </div>
      <Bat className={s.bat1} />
      <Bat className={s.bat2} />
      <Bat className={s.bat3} />
      <div className={`${s.fog} ${s.fogBack}`} />
      <svg className={s.hills} viewBox="0 0 1440 220" preserveAspectRatio="none">
        <path className={s.hillBack} d="M0 96C160 40 330 44 500 84S820 120 980 70 1300 30 1440 64V220H0z" />
        <path className={s.hillFront} d="M0 130C220 84 420 92 640 124S1010 160 1210 112 1400 96 1440 104V220H0z" />
      </svg>
      <Pumpkin style={{ left: "6vw", bottom: "calc(var(--hill-h) * 0.38)" }} />
      <Pumpkin style={{ left: "17vw", bottom: "calc(var(--hill-h) * 0.33)", ["--s" as string]: 0.72 }} />
      <Pumpkin style={{ right: "7vw", bottom: "calc(var(--hill-h) * 0.40)", ["--s" as string]: 0.9 }} />
      <div className={`${s.fog} ${s.fogFront}`} />
    </>
  );
}

function Classic() {
  return (
    <>
      <div className={s.daySky} />
      <div className={s.dayRays} />
      <svg className={`${s.ballMark} ${s.ballMark1}`} viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="44" />
        <path d="M6 50h30M64 50h30" />
        <circle cx="50" cy="50" r="13" />
      </svg>
      <svg className={`${s.ballMark} ${s.ballMark2}`} viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="44" />
        <path d="M6 50h30M64 50h30" />
        <circle cx="50" cy="50" r="13" />
      </svg>
      <Sparkle style={{ left: "12vw", top: "16vh", animationDelay: "-1s" }} />
      <Sparkle style={{ left: "82vw", top: "12vh", animationDelay: "-2.2s", width: "2.6vmin" }} />
      <Sparkle style={{ left: "88vw", top: "70vh", animationDelay: "-0.6s", width: "2vmin" }} />
      <Sparkle style={{ left: "6vw", top: "78vh", animationDelay: "-3s", width: "1.8vmin" }} />
      <div className={s.vignette} />
    </>
  );
}

/**
 * The persistent animated background, rendered once behind every screen (App.tsx does this).
 * Transforms and opacity only; pauses while the tab is hidden; still under reduced motion.
 * Reads the current screen to keep the moon and pumpkins out from under live HUD.
 */
export const Backdrop = memo(function Backdrop() {
  const theme = useSettings((st) => st.theme);
  const hud = useNav((st) => HUD[st.screen]);
  const hidden = useSyncExternalStore(subscribeVisibility, isHidden, () => false);
  return (
    <div
      className={s.backdrop}
      data-variant={theme === "classic" ? "classic" : "spooky"}
      data-hud={hud}
      data-paused={hidden || undefined}
      aria-hidden="true"
    >
      {theme === "classic" ? <Classic /> : <Spooky />}
    </div>
  );
});
