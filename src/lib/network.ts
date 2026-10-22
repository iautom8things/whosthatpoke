// How good the connection is: "good", "poor" or "offline", from what the game itself downloads. The browser's own
// hints count where there are any (navigator.connection: Chrome and Android, not iOS Safari). Everywhere else the
// art and clip downloads are timed: their throughput feeds an average with two thresholds, so a connection that
// sits between them keeps its state instead of flipping. On a poor connection the game skips the Pokédex entries'
// clips (src/audio/voice.ts). Offline means only what the device already has.

import { useSyncExternalStore } from "react";

export type NetQuality = "good" | "poor" | "offline";
export type FetchKind = "art" | "clip";

/** Under this average, in bytes per second, the connection is poor... */
export const POOR_BPS = 60_000;
/** ...and only over this is it good again. */
export const GOOD_BPS = 150_000;
/** A clip still downloading after this long makes the connection poor at once. */
export const SLOW_CLIP_MS = 2500;
/** Weight of each new measurement in the average. */
const ALPHA = 0.4;
/** One measurement counts at most this fast, so a single quick burst can't call a slow link good. */
const CAP_BPS = 250_000;
/** A measurement with fewer bytes times the round trip, not the link. */
const MIN_BYTES = 4096;
/** Downloads running together are one measurement: their bytes over the time any of them ran, at most this long. */
const WINDOW_MS = 1500;
/** Network errors in a row that mean the device is offline. Any download that answers ends it. */
const OFFLINE_AFTER = 2;
/** A clip download is given up after this long, so a stuck request is retried later instead of waited on. */
const CLIP_TIMEOUT_MS = 20_000;
const POOR_TYPES = new Set(["slow-2g", "2g", "3g"]);

/** The throughput average and its state. No browser in here: the tests feed it made-up measurements. */
export class Throughput {
  /** Bytes per second, null before the first measurement. */
  bps: number | null = null;
  poor = false;

  /** `bytes` arrived over `ms`. */
  add(bytes: number, ms: number): void {
    if (bytes < MIN_BYTES) return;
    const rate = Math.min(CAP_BPS, (bytes * 1000) / Math.max(1, ms));
    this.bps = this.bps === null ? rate : this.bps + ALPHA * (rate - this.bps);
    if (this.poor ? this.bps > GOOD_BPS : this.bps < POOR_BPS) this.poor = !this.poor;
  }

  /** A clip took too long: poor now, and the average must climb back from the low threshold. */
  slow(): void {
    this.poor = true;
    this.bps = Math.min(this.bps ?? POOR_BPS, POOR_BPS);
  }
}

interface Connection {
  effectiveType?: string;
  saveData?: boolean;
  addEventListener?(type: "change", cb: () => void): void;
}

export interface NetEnv {
  online(): boolean;
  connection(): Connection | null;
  now(): number;
  /** Calls back when the browser says the connection changed: online, offline, or a new effective type. */
  watch(cb: () => void): void;
}

function browserEnv(): NetEnv {
  const nav = typeof navigator === "undefined" ? undefined : (navigator as Navigator & { connection?: Connection });
  return {
    online: () => nav?.onLine !== false,
    connection: () => nav?.connection ?? null,
    now: () => performance.now(),
    watch: (cb) => {
      if (typeof window === "undefined") return;
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      nav?.connection?.addEventListener?.("change", cb);
    },
  };
}

export interface Download {
  /** It arrived, `bytes` long. 0 for an answer with nothing to measure (a 404, a timeout). */
  done(bytes: number): void;
  /** A network error: no answer at all. */
  failed(): void;
}

export class NetworkMonitor {
  private readonly meter = new Throughput();
  private readonly listeners = new Set<() => void>();
  private failures = 0;
  private running = 0;
  private windowStart = 0;
  private windowBytes = 0;
  private last: NetQuality;

  constructor(private readonly env: NetEnv = browserEnv()) {
    this.last = this.compute();
    env.watch(() => {
      // Back online: the errors from before say nothing about now.
      if (env.online()) this.failures = 0;
      this.update();
    });
  }

  get quality(): NetQuality {
    return this.last;
  }

  /** The measured average in bytes per second, for a status line. Null before anything was measured. */
  get bps(): number | null {
    return this.meter.bps;
  }

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };

  /** A download starts. Report on the result how it ended. */
  start(kind: FetchKind): Download {
    if (this.running++ === 0) {
      this.windowStart = this.env.now();
      this.windowBytes = 0;
    }
    // Poor as soon as a clip is late, not once it finally arrives.
    const late =
      kind === "clip"
        ? setTimeout(() => {
            this.meter.slow();
            this.update();
          }, SLOW_CLIP_MS)
        : undefined;
    let over = false;
    const end = (bytes: number | null) => {
      if (over) return;
      over = true;
      clearTimeout(late);
      this.running--;
      if (bytes === null) this.failures++;
      else {
        this.failures = 0;
        this.windowBytes += bytes;
      }
      const now = this.env.now();
      if (this.running === 0 || now - this.windowStart >= WINDOW_MS) {
        this.meter.add(this.windowBytes, now - this.windowStart);
        this.windowStart = now;
        this.windowBytes = 0;
      }
      this.update();
    };
    return { done: (bytes) => end(bytes), failed: () => end(null) };
  }

  private compute(): NetQuality {
    if (!this.env.online() || this.failures >= OFFLINE_AFTER) return "offline";
    const c = this.env.connection();
    if (c?.saveData || POOR_TYPES.has(c?.effectiveType ?? "")) return "poor";
    return this.meter.poor ? "poor" : "good";
  }

  private update(): void {
    const q = this.compute();
    if (q === this.last) return;
    this.last = q;
    for (const cb of this.listeners) cb();
  }
}

export const network = new NetworkMonitor();

/** The connection quality, re-rendering when it changes. */
export function useNetQuality(): NetQuality {
  return useSyncExternalStore(network.subscribe, () => network.quality, () => "good");
}

/**
 * What the device already has: the service worker's caches (a round played before, Save for offline, the core
 * clips). Read here, not through fetch(), so a file from the cache never counts as a fast download.
 */
async function fromCache(url: string): Promise<ArrayBuffer | null> {
  if (typeof caches === "undefined" || typeof location === "undefined") return null;
  try {
    const href = new URL(url, location.href).href;
    let hit = await caches.match(href);
    if (!hit) {
      // The precache keys each file with a revision query (?__WB_REVISION__=...), so an exact match misses it.
      const precache = (await caches.keys()).find((name) => name.includes("precache"));
      if (precache) hit = await (await caches.open(precache)).match(href, { ignoreSearch: true });
    }
    return hit?.ok ? await hit.arrayBuffer() : null;
  } catch {
    return null;
  }
}

export interface ReadOptions {
  kind: FetchKind;
  /** False: only what the device already has. Default true. */
  download?: boolean;
}

/**
 * A file's bytes, from the device's cache when it is there, else downloaded through the service worker (which
 * keeps a copy) and timed for the monitor. Null when it can't be had: offline, missing, or a clip that took too long.
 */
export async function readFile(url: string, { kind, download = true }: ReadOptions, monitor = network): Promise<ArrayBuffer | null> {
  const cached = await fromCache(url);
  if (cached || !download) return cached;
  const timing = monitor.start(kind);
  const abort = new AbortController();
  const timer = kind === "clip" ? setTimeout(() => abort.abort(), CLIP_TIMEOUT_MS) : undefined;
  try {
    const res = await fetch(url, { signal: abort.signal });
    if (!res.ok) {
      timing.done(0);
      return null;
    }
    const bytes = await res.arrayBuffer();
    timing.done(bytes.byteLength);
    return bytes;
  } catch {
    // A timeout is a slow answer (the late timer already said so), not a missing network.
    if (abort.signal.aborted) timing.done(0);
    else timing.failed();
    return null;
  } finally {
    clearTimeout(timer);
  }
}
