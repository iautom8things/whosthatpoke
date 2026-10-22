import { describe, expect, it } from "vitest";
import { ART_CACHE, countSaved, saveAll, SAVE_HEADER, VOICE_CACHE, voiceFiles, type SaveJob } from "./pwa-save";

const BASE = "https://example.test/wtp/";
const art = (n: number) => Array.from({ length: n }, (_, i) => `${BASE}pokemon/${i + 1}.svg`);
const clips = (...names: string[]) => names.map((n) => `${BASE}voice/${n}`);

/** An in-memory CacheStorage: cache name to URL to body. */
function fakeCaches(seed: Record<string, string[]> = {}, { full = false } = {}) {
  const store = new Map<string, Map<string, string>>(Object.entries(seed).map(([name, urls]) => [name, new Map(urls.map((u) => [u, "seed"]))]));
  const open = async (name: string) => {
    const entries = store.get(name) ?? store.set(name, new Map()).get(name)!;
    return {
      keys: async () => [...entries.keys()].map((u) => new Request(u)),
      delete: async (req: Request) => entries.delete(req.url),
      put: async (url: string, res: Response) => {
        if (full) throw new DOMException("no room", "QuotaExceededError");
        entries.set(url, await res.text());
      },
    } as unknown as Cache;
  };
  return { storage: { keys: async () => [...store.keys()], open } as unknown as CacheStorage, store };
}

/** A fetch that answers from `status(url, attempt)`, counting attempts and recording headers. */
function fakeFetch(status: (url: string, attempt: number) => number | "error" = () => 200) {
  const attempts = new Map<string, number>();
  const headers: Headers[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const get = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const n = attempts.get(url) ?? 0;
    attempts.set(url, n + 1);
    headers.push(new Headers(init?.headers));
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await Promise.resolve();
    inFlight--;
    if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
    const s = status(url, n);
    if (s === "error") throw new TypeError("Load failed");
    return new Response(s === 200 ? `body of ${url}` : null, { status: s });
  };
  return { get: get as typeof fetch, attempts, headers, maxInFlight: () => maxInFlight };
}

const noSleep = async () => {};

describe("voiceFiles", () => {
  it("lists every clip file once, facts last", () => {
    const index = { v: 1, packs: ["fact.25.mp3", "line.whos-that.0.mp3", "reveal.25.mp3", "fact.1.mp3", "reveal.25.mp3"], clips: {} };
    expect(voiceFiles(index)).toEqual(["line.whos-that.0.mp3", "reveal.25.mp3", "fact.25.mp3", "fact.1.mp3"]);
  });

  it("ignores anything that is not a v1 index or a plain mp3 name", () => {
    expect(voiceFiles(null)).toEqual([]);
    expect(voiceFiles({ v: 2, packs: ["a.mp3"] })).toEqual([]);
    expect(voiceFiles({ v: 1, packs: ["../secret.mp3", "sub/a.mp3", ".hidden.mp3", 7, "notes.txt", "ok.mp3"] })).toEqual(["ok.mp3"]);
  });
});

describe("countSaved", () => {
  it("counts each job's files in its own cache and in the precache, ignoring the revision query", async () => {
    const { storage } = fakeCaches({
      [ART_CACHE]: art(2),
      [VOICE_CACHE]: clips("reveal.1.mp3", "stale.mp3"),
      "workbox-precache-v2-https://example.test/wtp/": [`${BASE}voice/line.game-over.mp3?__WB_REVISION__=abc`, `${BASE}index.html`],
    });
    const jobs: SaveJob[] = [
      { cache: ART_CACHE, urls: art(5) },
      { cache: VOICE_CACHE, urls: clips("line.game-over.mp3", "reveal.1.mp3", "fact.1.mp3") },
    ];
    expect(await countSaved(jobs, storage)).toEqual([
      { have: 2, total: 5 },
      { have: 2, total: 3 },
    ]);
  });

  it("does not create caches that do not exist yet", async () => {
    const { storage, store } = fakeCaches();
    expect(await countSaved([{ cache: ART_CACHE, urls: art(3) }], storage)).toEqual([{ have: 0, total: 3 }]);
    expect(store.size).toBe(0);
  });
});

describe("saveAll", () => {
  it("downloads only what is missing, into each job's cache, with the save header", async () => {
    const { storage, store } = fakeCaches({ [ART_CACHE]: art(1) });
    const net = fakeFetch();
    const progress: number[][] = [];
    const result = await saveAll(
      [
        { cache: ART_CACHE, urls: art(3) },
        { cache: VOICE_CACHE, urls: clips("reveal.1.mp3") },
      ],
      { caches: storage, fetch: net.get, sleep: noSleep, onProgress: (t) => progress.push(t.map((x) => x.have)) },
    );
    expect(result).toEqual({ tallies: [{ have: 3, total: 3 }, { have: 1, total: 1 }], failed: 0, stopped: undefined });
    expect(net.attempts.has(art(1)[0])).toBe(false);
    expect(store.get(ART_CACHE)!.get(art(3)[2])).toBe(`body of ${art(3)[2]}`);
    expect(store.get(VOICE_CACHE)!.size).toBe(1);
    expect(net.headers.every((h) => h.get(SAVE_HEADER) === "1")).toBe(true);
    expect(progress[0]).toEqual([1, 0]);
    expect(progress.at(-1)).toEqual([3, 1]);
  });

  it("keeps at most `concurrency` downloads going", async () => {
    const { storage } = fakeCaches();
    const net = fakeFetch();
    await saveAll([{ cache: ART_CACHE, urls: art(40) }], { caches: storage, fetch: net.get, sleep: noSleep, concurrency: 6 });
    expect(net.maxInFlight()).toBe(6);
  });

  it("retries network errors and 5xx with backoff, but not a 404", async () => {
    const { storage } = fakeCaches();
    const flaky = art(1)[0];
    const gone = clips("gone.mp3")[0];
    const net = fakeFetch((url, n) => (url === gone ? 404 : n < 2 ? (n === 0 ? "error" : 503) : 200));
    const waits: number[] = [];
    const result = await saveAll(
      [
        { cache: ART_CACHE, urls: [flaky] },
        { cache: VOICE_CACHE, urls: [gone] },
      ],
      { caches: storage, fetch: net.get, sleep: async (ms) => void waits.push(ms) },
    );
    expect(net.attempts.get(flaky)).toBe(3);
    expect(net.attempts.get(gone)).toBe(1);
    expect(waits).toEqual([500, 1500]);
    expect(result.tallies).toEqual([{ have: 1, total: 1 }, { have: 0, total: 1 }]);
    expect(result.failed).toBe(1);
    expect(result.stopped).toBeUndefined();
  });

  it("gives up when file after file fails: the network is gone", async () => {
    const { storage } = fakeCaches();
    const net = fakeFetch(() => "error");
    const result = await saveAll([{ cache: ART_CACHE, urls: art(100) }], { caches: storage, fetch: net.get, sleep: noSleep, retries: 1, concurrency: 2 });
    expect(result.stopped).toBe("network");
    expect(net.attempts.size).toBeLessThan(15);
  });

  it("stops at once when the device is full", async () => {
    const { storage } = fakeCaches({}, { full: true });
    const net = fakeFetch();
    const result = await saveAll([{ cache: ART_CACHE, urls: art(50) }], { caches: storage, fetch: net.get, sleep: noSleep, concurrency: 1 });
    expect(result.stopped).toBe("full");
    expect(net.attempts.size).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("stops when cancelled, keeping what it saved", async () => {
    const { storage, store } = fakeCaches();
    const stop = new AbortController();
    const net = fakeFetch();
    const result = await saveAll([{ cache: ART_CACHE, urls: art(30) }], {
      caches: storage,
      fetch: net.get,
      sleep: noSleep,
      concurrency: 1,
      signal: stop.signal,
      onProgress: (t) => {
        if (t[0].have === 5) stop.abort();
      },
    });
    expect(result.stopped).toBe("cancelled");
    expect(result.failed).toBe(0);
    expect(store.get(ART_CACHE)!.size).toBe(5);
    expect(result.tallies[0].have).toBe(5);
  });
});

describe("saveAll after a re-recording", () => {
  it("deletes the clips the index no longer lists and keeps the rest", async () => {
    const { storage, store } = fakeCaches({
      [VOICE_CACHE]: clips("reveal.25.aaaaaaaa.mp3", "reveal.6.bbbbbbbb.mp3"),
      [ART_CACHE]: art(2),
    });
    const net = fakeFetch();
    const jobs: SaveJob[] = [
      { cache: ART_CACHE, urls: art(2) },
      { cache: VOICE_CACHE, urls: clips("reveal.25.aaaaaaaa.mp3", "reveal.6.cccccccc.mp3") },
    ];
    await saveAll(jobs, { caches: storage, fetch: net.get, sleep: noSleep });
    expect([...store.get(VOICE_CACHE)!.keys()].sort()).toEqual(clips("reveal.25.aaaaaaaa.mp3", "reveal.6.cccccccc.mp3"));
    expect([...store.get(ART_CACHE)!.keys()]).toEqual(art(2));
  });

  it("leaves a cache alone when its job lists nothing", async () => {
    const { storage, store } = fakeCaches({ [VOICE_CACHE]: clips("reveal.25.aaaaaaaa.mp3") });
    await saveAll([{ cache: VOICE_CACHE, urls: [] }], { caches: storage, fetch: fakeFetch().get, sleep: noSleep });
    expect([...store.get(VOICE_CACHE)!.keys()]).toEqual(clips("reveal.25.aaaaaaaa.mp3"));
  });
});
