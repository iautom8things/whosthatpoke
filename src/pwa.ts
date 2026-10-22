// Service worker registration and offline status. Import once from main.tsx for its side effect:
//   import "./pwa";
// Settings reads usePwa() to show whether the game is saved for offline play.
//
// The worker is in "prompt" mode: a new version waits instead of reloading the page mid-game.
// It applies itself while the splash screen is up, or when the host taps "Update" in Settings.
import { registerSW } from "virtual:pwa-register";
import { create } from "zustand";
import { useNav } from "./state/nav";

export type OfflineStatus =
  | "dev" // vite dev server: no service worker
  | "unsupported" // no service worker here (plain http on a LAN address, old browser)
  | "installing" // first visit: saving the game and all art
  | "reload" // saved, but this tab opened before the worker and still loads from the network
  | "ready" // saved, and this tab runs from the saved copy; works with no network
  | "error"; // saving failed, e.g. the Wi-Fi dropped partway through

export interface PwaState {
  status: OfflineStatus;
  /** A newer version is downloaded and waiting. applyUpdate() switches to it. */
  needRefresh: boolean;
  /** Pokémon pictures in the offline cache. null until counted. */
  cachedArt: number | null;
  /** Bytes this site keeps on the device, when the browser says. */
  usage: number | null;
  /** The browser promised not to clear the cache under storage pressure. */
  persisted: boolean | null;
}

export const usePwa = create<PwaState>(() => ({
  status: "installing",
  needRefresh: false,
  cachedArt: null,
  usage: null,
  persisted: null,
}));

let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;
let registration: ServiceWorkerRegistration | undefined;

/** Switch to the waiting version. The page reloads once the new worker takes over. */
export function applyUpdate(): void {
  void updateSW?.(true);
}

/** Throws the saved copy away and downloads everything again. Needs a network. */
export async function saveAgain(): Promise<void> {
  try {
    await registration?.unregister();
    for (const name of await caches.keys()) if (name.includes("precache")) await caches.delete(name);
  } catch {
    // The reload below registers the worker again either way.
  }
  location.reload();
}

const ART_PATH = /\/pokemon\/\d+\.(svg|webp|png)$/;
let statsRun = 0;
let statsShown = 0;

/** Counts cached art and storage use. Cheap enough to poll while the first install runs. */
export async function refreshOfflineStats(): Promise<void> {
  // No worker in dev, and ?demo=settings&pwa=... sets the numbers itself.
  if (import.meta.env.DEV) return;
  const run = ++statsRun;
  try {
    if (typeof caches !== "undefined") {
      let art = 0;
      for (const name of await caches.keys()) {
        if (!name.includes("precache")) continue;
        const requests = await (await caches.open(name)).keys();
        art = Math.max(art, requests.filter((r) => ART_PATH.test(new URL(r.url).pathname)).length);
      }
      // A slower, older count must not overwrite a newer one.
      if (run > statsShown) {
        statsShown = run;
        usePwa.setState({ cachedArt: art });
      }
    }
    const estimate = await navigator.storage?.estimate?.();
    if (estimate?.usage != null) usePwa.setState({ usage: estimate.usage });
  } catch {
    // Storage APIs can throw in private mode. The status line still works without numbers.
  }
}

async function keepStorage(): Promise<void> {
  try {
    const persisted = (await navigator.storage?.persisted?.()) || (await navigator.storage?.persist?.());
    usePwa.setState({ persisted: Boolean(persisted) });
  } catch {
    usePwa.setState({ persisted: false });
  }
}

function saved(): void {
  void keepStorage();
  void refreshOfflineStats();
}

let settle: ReturnType<typeof setTimeout> | undefined;

/**
 * "ready" only once the worker controls this tab: an uncontrolled tab still loads every picture
 * from the network, so it shows "?" offline even with the whole game saved.
 */
function syncStatus(): void {
  if (!registration?.active) return; // Still installing. watch() reports a failed install.
  clearTimeout(settle);
  if (navigator.serviceWorker.controller) {
    if (usePwa.getState().status !== "ready") {
      // Recount from scratch so a count polled mid-install can't flash "pictures missing".
      statsShown = statsRun;
      usePwa.setState({ status: "ready", cachedArt: null });
      saved();
    }
    return;
  }
  // clientsClaim takes this tab over right after activation. If it still hasn't, a reload will.
  settle = setTimeout(() => {
    if (!navigator.serviceWorker.controller) usePwa.setState({ status: "reload" });
  }, 3000);
}

function watch(worker: ServiceWorker | null): void {
  worker?.addEventListener("statechange", () => {
    const reg = registration;
    // A first install that fails (one of ~1000 downloads dropped) discards the worker and fires
    // nothing else, so without this the card would say "Saving…" forever.
    const noOtherWorker = reg && !reg.active && !reg.waiting && (!reg.installing || reg.installing === worker);
    if (worker.state === "redundant" && noOtherWorker) {
      usePwa.setState({ status: "error" });
    }
    syncStatus();
  });
}

function start(): void {
  if (import.meta.env.DEV) {
    usePwa.setState({ status: "dev" });
    return;
  }
  if (!("serviceWorker" in navigator) || !window.isSecureContext) {
    usePwa.setState({ status: "unsupported" });
    return;
  }
  navigator.serviceWorker.addEventListener("controllerchange", syncStatus);
  updateSW = registerSW({
    immediate: true,
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      registration = reg;
      watch(reg.installing ?? reg.waiting);
      reg.addEventListener("updatefound", () => watch(reg.installing));
      syncStatus();
    },
    onOfflineReady() {
      saved();
      syncStatus();
    },
    onNeedRefresh() {
      usePwa.setState({ needRefresh: true });
      // Nobody is playing yet on the splash screen, so reloading there costs nothing.
      if (useNav.getState().screen === "splash") applyUpdate();
    },
    onRegisterError() {
      usePwa.setState({ status: "error" });
    },
  });
}

declare global {
  interface Window {
    __wtpPwa?: boolean;
  }
}

if (typeof window !== "undefined" && !window.__wtpPwa) {
  window.__wtpPwa = true;
  start();
}
