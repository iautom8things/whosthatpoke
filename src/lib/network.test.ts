import { afterEach, describe, expect, it, vi } from "vitest";
import { GOOD_BPS, NetworkMonitor, POOR_BPS, SLOW_CLIP_MS, Throughput, type NetEnv } from "./network";

const KB = 1000;

/** `n` downloads of `bytes` each at `bps`. */
function feed(t: Throughput, bps: number, n = 1, bytes = 30 * KB) {
  for (let i = 0; i < n; i++) t.add(bytes, (bytes / bps) * 1000);
}

describe("throughput average", () => {
  it("stays good on a fast link and turns poor on a slow one", () => {
    const t = new Throughput();
    feed(t, 500 * KB, 5);
    expect(t.poor).toBe(false);
    // An average, so a link that slows down takes a few downloads to show it.
    feed(t, 20 * KB, 4);
    expect(t.poor).toBe(true);
  });

  it("is poor from the first measurement on a slow link", () => {
    const t = new Throughput();
    feed(t, 30 * KB);
    expect(t.poor).toBe(true);
  });

  it("holds its state between the two thresholds", () => {
    const between = (POOR_BPS + GOOD_BPS) / 2;
    const good = new Throughput();
    feed(good, between, 10);
    expect(good.poor).toBe(false);

    const poor = new Throughput();
    feed(poor, 20 * KB);
    feed(poor, between, 10);
    expect(poor.poor).toBe(true);
    feed(poor, 300 * KB, 3);
    expect(poor.poor).toBe(false);
  });

  it("needs more than one fast burst to call a slow link good", () => {
    const t = new Throughput();
    feed(t, 20 * KB, 3);
    feed(t, 5000 * KB, 1, 200 * KB);
    expect(t.poor).toBe(true);
    feed(t, 5000 * KB, 1, 200 * KB);
    expect(t.poor).toBe(false);
  });

  it("ignores files too small to say anything about the link", () => {
    const t = new Throughput();
    t.add(800, 2000);
    expect(t.bps).toBeNull();
    expect(t.poor).toBe(false);
  });

  it("turns poor at once on a late clip, and needs real speed to come back", () => {
    const t = new Throughput();
    feed(t, 400 * KB, 5);
    t.slow();
    expect(t.poor).toBe(true);
    feed(t, 120 * KB, 3);
    expect(t.poor).toBe(true);
    feed(t, 400 * KB, 2);
    expect(t.poor).toBe(false);
  });
});

function fakeEnv() {
  const env = {
    clock: 0,
    onLine: true,
    conn: null as { effectiveType?: string; saveData?: boolean } | null,
    changed: () => {},
    online: () => env.onLine,
    connection: () => env.conn,
    now: () => env.clock,
    watch: (cb: () => void) => {
      env.changed = cb;
    },
  };
  return env satisfies NetEnv;
}

describe("network monitor", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is offline when the browser says so, and back when it says online", () => {
    const env = fakeEnv();
    const net = new NetworkMonitor(env);
    const seen: string[] = [];
    net.subscribe(() => seen.push(net.quality));
    env.onLine = false;
    env.changed();
    env.onLine = true;
    env.changed();
    expect(seen).toEqual(["offline", "good"]);
  });

  it("takes the browser's hint where there is one", () => {
    const env = fakeEnv();
    env.conn = { effectiveType: "3g" };
    expect(new NetworkMonitor(env).quality).toBe("poor");
    env.conn = { effectiveType: "4g", saveData: true };
    expect(new NetworkMonitor(env).quality).toBe("poor");
    env.conn = { effectiveType: "4g" };
    expect(new NetworkMonitor(env).quality).toBe("good");
  });

  it("counts downloads that overlap as one measurement", () => {
    // Four 20 KB clips side by side in 400 ms: 200 KB/s for the link, though each one alone took 400 ms.
    const env = fakeEnv();
    const net = new NetworkMonitor(env);
    const all = [0, 1, 2, 3].map(() => net.start("art"));
    env.clock = 400;
    for (const d of all) d.done(20 * KB);
    expect(net.bps).toBe(200 * KB);
    expect(net.quality).toBe("good");
  });

  it("measures a slow link from the downloads", () => {
    const env = fakeEnv();
    const net = new NetworkMonitor(env);
    const d = net.start("art");
    env.clock = 1000;
    d.done(30 * KB);
    expect(net.quality).toBe("poor");
  });

  it("is offline after network errors in a row, until something answers", () => {
    const env = fakeEnv();
    const net = new NetworkMonitor(env);
    net.start("clip").failed();
    expect(net.quality).toBe("good");
    net.start("clip").failed();
    expect(net.quality).toBe("offline");
    net.start("art").done(0);
    expect(net.quality).toBe("good");
  });

  it("turns poor while a clip is still downloading past the limit", () => {
    vi.useFakeTimers();
    const env = fakeEnv();
    const net = new NetworkMonitor(env);
    const d = net.start("clip");
    vi.advanceTimersByTime(SLOW_CLIP_MS - 1);
    expect(net.quality).toBe("good");
    vi.advanceTimersByTime(1);
    expect(net.quality).toBe("poor");
    d.done(12 * KB);
    expect(net.quality).toBe("poor");
  });
});
