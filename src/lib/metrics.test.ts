import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StorageLike } from "../game/storage";
import { LATE_MS, Metrics, metricsAllowed, OUTBOX_KEY, OUTBOX_MAX, type MetricsEnv, type Page } from "./metrics";

const PAGE: Page = {
  website: "6f1c2a4e-0000-4000-8000-000000000000",
  hostname: "iautom8things.github.io",
  url: "/whosthatpoke/",
  title: "Who's That Pokémon?",
  language: "en-US",
  screen: "1024x768",
  referrer: "",
  id: "load-1",
};
const T0 = 1_800_000_000_000;

function memoryStorage(): StorageLike {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

type Received = Page & { name?: string; data?: Record<string, unknown>; timestamp?: number };

/**
 * Umami as the outbox sees it: `status` answers every send, null for no answer. `received` is what it counted.
 * While `hold` is set, sends wait for answer().
 */
function fakeEnv(storage = memoryStorage()) {
  const env = {
    storage,
    clock: T0,
    status: 200 as number | null,
    tries: 0,
    received: [] as Received[],
    hold: false,
    held: [] as (() => void)[],
    answer: () => env.held.splice(0).forEach((go) => go()),
    online: () => {},
    hide: () => {},
    post: async (body: string) => {
      env.tries++;
      if (env.hold) await new Promise<void>((go) => env.held.push(go));
      const { type, payload } = JSON.parse(body);
      expect(type).toBe("event");
      if (env.status !== null && env.status < 300) env.received.push(payload);
      return env.status;
    },
    now: () => env.clock,
    watch: (online: () => void, hide: () => void) => {
      env.online = online;
      env.hide = hide;
    },
  };
  return env satisfies MetricsEnv;
}

const saved = (storage: StorageLike) => JSON.parse(storage.getItem(OUTBOX_KEY) ?? "[]") as { payload: Received }[];
const settle = () => vi.runAllTimersAsync();

describe("metrics outbox", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends fresh hits as the tracker would, with no timestamp", async () => {
    const env = fakeEnv();
    const m = new Metrics(PAGE, env);
    m.pageview();
    m.track("app_open", { display: "browser", projector: false });
    await settle();
    expect(env.received).toEqual([PAGE, { ...PAGE, name: "app_open", data: { display: "browser", projector: false } }]);
    expect(env.storage.getItem(OUTBOX_KEY)).toBeNull();
  });

  it("keeps hits while offline, then sends them oldest first at the time they happened", async () => {
    const env = fakeEnv();
    env.status = null;
    const m = new Metrics(PAGE, env);
    m.track("game_start", { mode: "classic" });
    env.clock += 30_000;
    m.track("game_finish", { score: 300 });
    await settle();
    expect(env.received).toEqual([]);
    expect(saved(env.storage).map((h) => h.payload.name)).toEqual(["game_start", "game_finish"]);

    env.clock += 2 * LATE_MS;
    env.status = 200;
    env.online();
    await settle();
    expect(env.received.map(({ name, timestamp, data }) => ({ name, timestamp, data }))).toEqual([
      { name: "game_start", timestamp: T0 / 1000, data: { mode: "classic", late: true } },
      { name: "game_finish", timestamp: T0 / 1000 + 30, data: { score: 300, late: true } },
    ]);
    expect(env.storage.getItem(OUTBOX_KEY)).toBeNull();
  });

  it("drops a hit Umami refused and keeps one it failed on", async () => {
    const env = fakeEnv();
    const m = new Metrics(PAGE, env);
    env.status = 400;
    m.track("refused");
    await settle();
    env.status = 503;
    m.track("failed");
    await settle();
    expect(saved(env.storage).map((h) => h.payload.name)).toEqual(["failed"]);

    env.status = 200;
    env.online();
    await settle();
    expect(env.received.map((p) => p.name)).toEqual(["failed"]);
    expect(env.tries).toBe(3);
  });

  it("keeps what a closing page tracked, and the next page load sends it under its own id", async () => {
    const storage = memoryStorage();
    const first = fakeEnv(storage);
    new Metrics(PAGE, first).track("game_quit", { asked: 3 });
    first.hide();
    // A send started by the closing page might never get its answer back to put the hit back.
    expect(first.tries).toBe(0);
    expect(saved(storage).map((h) => h.payload.name)).toEqual(["game_quit"]);

    const second = fakeEnv(storage);
    second.clock = T0 + 10 * 60_000;
    await new Metrics({ ...PAGE, id: "load-2" }, second).flush();
    expect(second.received).toEqual([{ ...PAGE, name: "game_quit", timestamp: T0 / 1000, data: { asked: 3, late: true } }]);
  });

  it("stops taking hits when full, keeping the oldest, and sends them all once online", async () => {
    const env = fakeEnv();
    env.status = null;
    const m = new Metrics(PAGE, env);
    for (let i = 0; i < OUTBOX_MAX + 5; i++) m.track("pokemon_named", { i });
    await settle();
    const hits = saved(env.storage);
    expect(hits).toHaveLength(OUTBOX_MAX);
    expect(hits.at(-1)?.payload.data).toEqual({ i: OUTBOX_MAX - 1 });

    env.status = 200;
    env.online();
    await settle();
    expect(env.received).toHaveLength(OUTBOX_MAX);
    expect(env.storage.getItem(OUTBOX_KEY)).toBeNull();
  });

  it("sends a finished game's hits at once, so a page closed right after still gets them out", async () => {
    const env = fakeEnv();
    env.hold = true;
    const m = new Metrics(PAGE, env);
    m.track("game_finish", { score: 900 });
    for (let i = 0; i < 10; i++) m.track("pokemon_named", { i });
    await settle();
    expect(env.tries).toBe(11);
    env.hide();
    // All on their way: keepalive finishes them after the page is gone.
    expect(env.storage.getItem(OUTBOX_KEY)).toBeNull();
  });

  it("never lets the next page load send a hit again that was on its way when the page went away", async () => {
    const storage = memoryStorage();
    const first = fakeEnv(storage);
    first.hold = true;
    new Metrics(PAGE, first).track("error", { kind: "chunk" });
    await settle();
    // Gone with no pagehide (killed in the background), its keepalive request still out.

    const second = fakeEnv(storage);
    await new Metrics({ ...PAGE, id: "load-2" }, second).flush();
    expect([first.tries, second.tries]).toEqual([1, 0]);
  });

  it("saves a hit again when its send fails after the page was hidden", async () => {
    const env = fakeEnv();
    env.hold = true;
    new Metrics(PAGE, env).track("offline_save", { result: "done" });
    await settle();
    env.hide();
    expect(env.storage.getItem(OUTBOX_KEY)).toBeNull();

    env.status = null;
    env.answer();
    await settle();
    expect(saved(env.storage).map((h) => h.payload.name)).toEqual(["offline_save"]);
  });
});

describe("where metrics run", () => {
  const real = { prod: true, hostname: "iautom8things.github.io", search: "", webdriver: false, websiteId: PAGE.website };

  it("counts only the real game, never dev, QA, agents or a build with no website id", () => {
    expect(metricsAllowed(real)).toBe(true);
    expect(metricsAllowed({ ...real, search: "?projector=on" })).toBe(true);
    expect(metricsAllowed({ ...real, websiteId: "" })).toBe(false);
    expect(metricsAllowed({ ...real, prod: false })).toBe(false);
    expect(metricsAllowed({ ...real, hostname: "192.168.1.20" })).toBe(false);
    expect(metricsAllowed({ ...real, webdriver: true })).toBe(false);
    expect(metricsAllowed({ ...real, search: "?demo=results" })).toBe(false);
    expect(metricsAllowed({ ...real, search: "?lab=audio" })).toBe(false);
    expect(metricsAllowed({ ...real, search: "?nostats" })).toBe(false);
    expect(metricsAllowed({ ...real, search: "?projector=on&nostats=1" })).toBe(false);
  });
});
