import confetti from "canvas-confetti";
import { isReducedMotion } from "../../lib/reducedMotion";

export type CelebrateKind = "burst" | "cannons" | "rain" | "stars";

export interface CelebrateOptions {
  /** 0..1 of the viewport. Default center, a bit high. */
  origin?: { x: number; y: number };
  /** 0.5 = small, 1 = normal, 2 = huge. */
  intensity?: number;
}

let fire: confetti.CreateTypes | null = null;

function instance(): confetti.CreateTypes {
  if (fire) return fire;
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "fixed",
    inset: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    zIndex: "var(--z-confetti)",
  });
  document.body.appendChild(canvas);
  fire = confetti.create(canvas, { resize: true, useWorker: true });
  return fire;
}

/** Theme confetti colors from tokens.css (--confetti-1..6). */
function themeColors(): string[] {
  const css = getComputedStyle(document.documentElement);
  const colors = [1, 2, 3, 4, 5, 6].map((i) => css.getPropertyValue(`--confetti-${i}`).trim()).filter(Boolean);
  return colors.length ? colors : ["#ffcb05", "#ff8a1f", "#8b5cff", "#ffffff"];
}

/**
 * Fires theme-colored confetti. Skipped entirely under reduced motion.
 * Pair it with audio.sfx("pop") or "fanfare" at the call site.
 */
export function celebrate(kind: CelebrateKind = "burst", { origin = { x: 0.5, y: 0.45 }, intensity = 1 }: CelebrateOptions = {}): void {
  if (typeof document === "undefined" || isReducedMotion()) return;
  const shoot = instance();
  const colors = themeColors();
  const n = (count: number) => Math.round(count * intensity);
  const base = { colors, disableForReducedMotion: true, zIndex: 0 };

  switch (kind) {
    case "burst":
      shoot({ ...base, particleCount: n(90), spread: 75, startVelocity: 48, origin, scalar: 1.2, ticks: 220 });
      shoot({ ...base, particleCount: n(40), spread: 120, startVelocity: 30, origin, shapes: ["star"], scalar: 1.5, ticks: 240 });
      break;
    case "cannons":
      shoot({ ...base, particleCount: n(70), angle: 60, spread: 60, startVelocity: 62, origin: { x: 0, y: 0.85 }, scalar: 1.2 });
      shoot({ ...base, particleCount: n(70), angle: 120, spread: 60, startVelocity: 62, origin: { x: 1, y: 0.85 }, scalar: 1.2 });
      break;
    case "stars":
      shoot({ ...base, particleCount: n(36), spread: 360, startVelocity: 26, gravity: 0.5, decay: 0.92, origin, shapes: ["star"], scalar: 1.8, ticks: 160 });
      break;
    case "rain": {
      const end = performance.now() + 1800 * intensity;
      const frame = () => {
        shoot({ ...base, particleCount: 4, angle: 270, spread: 120, startVelocity: 12, gravity: 0.9, origin: { x: Math.random(), y: -0.05 }, scalar: 1.2, ticks: 300 });
        if (performance.now() < end) requestAnimationFrame(frame);
      };
      frame();
      break;
    }
  }
}

/** Clears confetti in flight (e.g. leaving the results screen). */
export function clearConfetti(): void {
  fire?.reset();
}
