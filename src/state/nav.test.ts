import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A window with just enough history for the Back trap: pushState counts entries, back() pops one.
function fakeWindow() {
  const events = new EventTarget();
  let entries = 1;
  const win = Object.assign(events, {
    location: { href: "http://localhost/?demo=title" },
    history: {
      pushState: vi.fn(() => void entries++),
      back: () => {
        entries--;
        events.dispatchEvent(new Event("popstate"));
      },
    },
    entries: () => entries,
  });
  return win;
}

let win: ReturnType<typeof fakeWindow>;
beforeEach(() => {
  vi.resetModules();
  win = fakeWindow();
  vi.stubGlobal("window", win);
});
afterEach(() => vi.unstubAllGlobals());

describe("browser Back", () => {
  it("runs the app's back instead of leaving, and keeps the URL", async () => {
    const { useNav } = await import("./nav");
    useNav.setState({ screen: "title", history: [] });
    useNav.getState().go("category");
    useNav.getState().go("difficulty");
    expect(win.history.pushState).toHaveBeenCalledTimes(1);
    expect(win.history.pushState).toHaveBeenCalledWith(expect.anything(), "", "http://localhost/?demo=title");
    win.history.back();
    expect(useNav.getState().screen).toBe("category");
    expect(win.entries()).toBe(2); // the trap entry is back, so the next Back is caught too
    win.history.back();
    expect(useNav.getState().screen).toBe("title");
  });

  it("ignores Back during a game unless the screen registers its own", async () => {
    const { useNav, onBrowserBack } = await import("./nav");
    useNav.setState({ screen: "difficulty", history: ["title", "category"] });
    useNav.getState().go("game");
    win.history.back();
    expect(useNav.getState().screen).toBe("game");
    const quit = vi.fn();
    const off = onBrowserBack(quit);
    win.history.back();
    expect(quit).toHaveBeenCalledTimes(1);
    expect(useNav.getState().screen).toBe("game");
    off();
    win.history.back();
    expect(quit).toHaveBeenCalledTimes(1);
  });
});
