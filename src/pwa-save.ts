// Save for offline: puts every picture and voice clip in the caches the service worker reads, from the page with the
// Cache API. The worker already keeps whatever a round fetches (CacheFirst routes in vite.config.ts); this fills
// the same caches with the rest, so a device that saved once plays with no network. src/pwa.ts runs it.
// The caches, fetch and the clock come in as options, so the tests need no browser.

/** The worker's runtime caches. vite.config.ts names them too. */
export const ART_CACHE = "wtp-art";
export const VOICE_CACHE = "wtp-voice";
/**
 * Sent on every save request. The worker's art and voice routes skip requests that carry it, so each file is
 * written once, here, instead of by both the worker and the page. vite.config.ts checks the same name.
 */
export const SAVE_HEADER = "x-wtp-save";

export interface SaveJob {
  cache: string;
  /** Absolute URLs, in download order. */
  urls: readonly string[];
}

/** How many of a job's files are saved. */
export interface Tally {
  have: number;
  total: number;
}

/** Why a save ended early: stop() was called, the network kept failing, or the device ran out of room. */
export type StopReason = "cancelled" | "network" | "full";

export interface SaveResult {
  /** One per job, in job order. */
  tallies: Tally[];
  /** Files that still failed after their retries. */
  failed: number;
  stopped?: StopReason;
}

export interface SaveOptions {
  /** Downloads at once. */
  concurrency?: number;
  /** Tries after the first, with backoff, for network errors and 5xx. */
  retries?: number;
  signal?: AbortSignal;
  /** After the first count, then after every saved file. */
  onProgress?: (tallies: Tally[]) => void;
  caches?: CacheStorage;
  fetch?: typeof fetch;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

/** Wait before retry n (0-based): 0.5 s, 1.5 s, 4.5 s. */
const BACKOFF_MS = 500;
/** Files in a row that fail every retry before the run gives up: the Wi-Fi is gone, not one file. */
const GIVE_UP_AFTER = 8;

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    }
    signal?.addEventListener("abort", done);
  });
}

/** Cache keys compare without the query, so the precache's `?__WB_REVISION__=` keys count. */
const keyOf = (url: string) => {
  const u = new URL(url);
  return u.origin + u.pathname;
};

/** The clip files a v1 voice/index.json lists, facts last: they are most of the bytes, and a slow phone skips them. */
export function voiceFiles(index: unknown): string[] {
  const i = index as { v?: unknown; packs?: unknown } | null;
  if (i?.v !== 1 || !Array.isArray(i.packs)) return [];
  const names = [...new Set(i.packs.filter((p): p is string => typeof p === "string" && /^[A-Za-z0-9-][A-Za-z0-9.-]*\.mp3$/.test(p)))];
  const fact = (n: string) => n.startsWith("fact.");
  return [...names.filter((n) => !fact(n)), ...names.filter(fact)];
}

/** Each job's URLs that are saved: in its own cache, or in the worker's precache (the core voice lines live there). */
async function savedUrls(jobs: readonly SaveJob[], storage: CacheStorage): Promise<Set<string>[]> {
  const names = await storage.keys();
  const keysIn = async (name: string) => (await (await storage.open(name)).keys()).map((r) => keyOf(r.url));
  const precache = (await Promise.all(names.filter((n) => n.includes("precache")).map(keysIn))).flat();
  return Promise.all(
    jobs.map(async (job) => {
      const have = new Set([...precache, ...(names.includes(job.cache) ? await keysIn(job.cache) : [])]);
      return new Set(job.urls.filter((u) => have.has(keyOf(u))));
    }),
  );
}

/** How many of each job's files are saved. One keys() per cache, so it is cheap enough for every Settings visit. */
export async function countSaved(jobs: readonly SaveJob[], storage: CacheStorage = globalThis.caches): Promise<Tally[]> {
  const saved = await savedUrls(jobs, storage);
  return jobs.map((job, i) => ({ have: saved[i].size, total: job.urls.length }));
}

/**
 * Deletes what each job's cache holds that the job no longer lists. A re-recorded clip ships under a new name, so
 * the old file would otherwise sit on the device for good. A job with no files (its index failed to load) is left alone.
 */
async function prune(jobs: readonly SaveJob[], storage: CacheStorage): Promise<void> {
  const names = await storage.keys();
  for (const job of jobs) {
    if (job.urls.length === 0 || !names.includes(job.cache)) continue;
    const keep = new Set(job.urls.map(keyOf));
    const cache = await storage.open(job.cache);
    for (const request of await cache.keys()) if (!keep.has(keyOf(request.url))) await cache.delete(request);
  }
}

const isQuota = (e: unknown) => (e as { name?: unknown } | null)?.name === "QuotaExceededError";

/** Downloads every file not saved yet into its job's cache, jobs in order. Never throws. */
export async function saveAll(jobs: readonly SaveJob[], options: SaveOptions = {}): Promise<SaveResult> {
  const { concurrency = 6, retries = 3, signal, onProgress, caches: storage = globalThis.caches, fetch: get = globalThis.fetch, sleep = wait } = options;
  let saved: Set<string>[];
  try {
    saved = await savedUrls(jobs, storage);
    await prune(jobs, storage).catch(() => {});
  } catch {
    // No Cache API here (private mode can block it): nothing can be saved.
    return { tallies: jobs.map((job) => ({ have: 0, total: job.urls.length })), failed: 0, stopped: "full" };
  }
  const tallies = jobs.map((job, i) => ({ have: saved[i].size, total: job.urls.length }));
  const report = () => onProgress?.(tallies.map((t) => ({ ...t })));
  report();

  const queue = jobs.flatMap((job, i) => job.urls.filter((url) => !saved[i].has(url)).map((url) => ({ job: i, url })));
  const open = jobs.map((job) => {
    const cache = storage.open(job.cache);
    cache.catch(() => {}); // a job with nothing left to fetch never awaits it
    return cache;
  });
  let next = 0;
  let failed = 0;
  let failedInARow = 0;
  let stopped: StopReason | undefined;
  const over = () => stopped !== undefined || signal?.aborted === true;

  /** "missing" is a 4xx: the file is not on the server, and retrying will not change that. */
  const fetchOne = async (job: number, url: string): Promise<"ok" | "missing" | "failed" | "stopped"> => {
    for (let attempt = 0; ; attempt++) {
      let res: Response | undefined;
      try {
        res = await get(url, { headers: { [SAVE_HEADER]: "1" }, signal });
      } catch {
        // A network error, or stop()
      }
      if (over()) return "stopped";
      if (res?.status === 200) {
        try {
          await (await open[job]).put(url, res);
          return "ok";
        } catch (e) {
          if (isQuota(e)) {
            stopped = "full";
            return "stopped";
          }
          // The body broke off mid-download: try again.
        }
      } else if (res) {
        void res.body?.cancel().catch(() => {});
        if (res.status < 500 && res.status !== 429) return "missing";
      }
      if (attempt >= retries) return "failed";
      await sleep(BACKOFF_MS * 3 ** attempt, signal);
      if (over()) return "stopped";
    }
  };

  const worker = async () => {
    while (!over() && next < queue.length) {
      const { job, url } = queue[next++];
      const result = await fetchOne(job, url);
      if (result === "ok") {
        tallies[job].have++;
        failedInARow = 0;
        report();
      } else if (result !== "stopped") {
        failed++;
        if (result === "failed" && ++failedInARow >= GIVE_UP_AFTER) stopped = "network";
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  if (signal?.aborted && stopped === undefined) stopped = "cancelled";
  return { tallies, failed, stopped };
}
