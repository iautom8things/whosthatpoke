import { useEffect, useState } from "react";

export interface CountdownOptions {
  /** Time left when it starts. Default the full `totalMs` (demos start it lower). */
  startMs?: number;
  /** Fires once when the time runs out. */
  onEnd?: () => void;
  /** Fires each time the whole seconds left change, with the new count (ceil). */
  onSecond?: (secondsLeft: number) => void;
}

/**
 * A pausable countdown driven by requestAnimationFrame. The question clock and the
 * auto-advance on the reveal both use it. Nothing runs until start().
 */
export class Countdown {
  private readonly listeners = new Set<() => void>();
  private readonly initial: number;
  private elapsedBefore = 0;
  private startedAt = 0;
  private running = false;
  private finished = false;
  private raf = 0;
  private lastSecond: number;

  constructor(
    readonly totalMs: number,
    private readonly opts: CountdownOptions = {},
  ) {
    this.initial = Math.min(totalMs, Math.max(0, opts.startMs ?? totalMs));
    this.lastSecond = Math.ceil(this.initial / 1000);
  }

  get isRunning(): boolean {
    return this.running;
  }

  get isFinished(): boolean {
    return this.finished;
  }

  msLeft(): number {
    const elapsed = this.elapsedBefore + (this.running ? performance.now() - this.startedAt : 0);
    return Math.max(0, this.initial - elapsed);
  }

  fraction(): number {
    return this.totalMs > 0 ? this.msLeft() / this.totalMs : 0;
  }

  start(): void {
    if (this.running || this.finished) return;
    this.running = true;
    this.startedAt = performance.now();
    this.raf = requestAnimationFrame(this.loop);
    this.emit();
  }

  pause(): void {
    if (!this.running) return;
    this.elapsedBefore += performance.now() - this.startedAt;
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.emit();
  }

  /** Freezes it for good and returns the time that was left. */
  stop(): number {
    const left = this.msLeft();
    this.pause();
    this.finished = true;
    this.emit();
    return left;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }

  private loop = () => {
    if (!this.running) return;
    const left = this.msLeft();
    const second = Math.ceil(left / 1000);
    if (second !== this.lastSecond) {
      this.lastSecond = second;
      this.opts.onSecond?.(second);
    }
    if (left <= 0) {
      this.elapsedBefore = this.initial;
      this.running = false;
      this.finished = true;
      this.emit();
      this.opts.onEnd?.();
      return;
    }
    this.emit();
    this.raf = requestAnimationFrame(this.loop);
  };
}

/**
 * Re-renders with the countdown's state, quantized to `steps` per full run so a 20 s clock
 * does not re-render 60 times a second. The bar's CSS transition smooths the steps.
 */
export function useCountdownView(c: Countdown | null, steps = 160): { fraction: number; seconds: number; running: boolean } {
  const read = () => ({
    c,
    q: c ? Math.round(c.fraction() * steps) : steps,
    seconds: c ? Math.ceil(c.msLeft() / 1000) : 0,
    running: c?.isRunning ?? false,
  });
  const [stored, setView] = useState(read);
  // A new countdown reads fresh on its first render instead of showing the old one's numbers.
  const view = stored.c === c ? stored : read();

  useEffect(() => {
    setView(read());
    if (!c) return;
    return c.subscribe(() => {
      const next = read();
      setView((prev) => (prev.c === next.c && prev.q === next.q && prev.seconds === next.seconds && prev.running === next.running ? prev : next));
    });
    // read() only closes over c and steps, which are the deps.
  }, [c, steps]);

  return { fraction: view.q / steps, seconds: view.seconds, running: view.running };
}
