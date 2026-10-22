import { describe, expect, it } from "vitest";
import { keepScreenAwake, type AwakeEnv } from "./useWakeLock";

class FakeTarget {
  listeners = new Map<string, Set<() => void>>();
  addEventListener(type: string, cb: () => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(cb);
  }
  removeEventListener(type: string, cb: () => void) {
    this.listeners.get(type)?.delete(cb);
  }
  fire(type: string) {
    for (const cb of this.listeners.get(type) ?? []) cb();
  }
  count() {
    return [...this.listeners.values()].reduce((n, set) => n + set.size, 0);
  }
}

class FakeSentinel {
  released = false;
  async release() {
    this.released = true;
  }
}

function setup({ deny = 0 } = {}) {
  const doc = Object.assign(new FakeTarget(), { visibilityState: "visible" as DocumentVisibilityState });
  const win = new FakeTarget();
  const granted: FakeSentinel[] = [];
  let requests = 0;
  let denials = deny;
  const wakeLock = {
    request: async () => {
      requests += 1;
      if (denials-- > 0) throw new DOMException("no gesture", "NotAllowedError");
      const s = new FakeSentinel();
      granted.push(s);
      return s as unknown as WakeLockSentinel;
    },
  };
  const env = { wakeLock, doc, win } as unknown as AwakeEnv;
  return { env, doc, win, granted, requests: () => requests };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("keepScreenAwake", () => {
  it("asks once, and not again while a lock is held", async () => {
    const t = setup();
    keepScreenAwake(t.env);
    t.win.fire("pointerdown");
    await flush();
    t.win.fire("pointerdown");
    t.win.fire("keydown");
    await flush();
    expect(t.requests()).toBe(1);
    expect(t.granted).toHaveLength(1);
  });

  it("asks again when the page comes back after the OS dropped the lock", async () => {
    const t = setup();
    keepScreenAwake(t.env);
    await flush();
    t.granted[0].released = true;
    t.doc.visibilityState = "hidden";
    t.doc.fire("visibilitychange");
    await flush();
    expect(t.requests()).toBe(1);
    t.doc.visibilityState = "visible";
    t.doc.fire("visibilitychange");
    await flush();
    expect(t.requests()).toBe(2);
  });

  it("swallows a refusal and retries on the next tap", async () => {
    const t = setup({ deny: 1 });
    keepScreenAwake(t.env);
    await flush();
    expect(t.granted).toHaveLength(0);
    t.win.fire("pointerdown");
    await flush();
    expect(t.requests()).toBe(2);
    expect(t.granted).toHaveLength(1);
  });

  it("releases the lock and its listeners on stop, even if the grant arrives late", async () => {
    const t = setup();
    const stop = keepScreenAwake(t.env);
    stop();
    await flush();
    expect(t.granted[0].released).toBe(true);
    expect(t.win.count() + t.doc.count()).toBe(0);
  });
});
