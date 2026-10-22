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
  | "ready" // everything is saved; works with no network
  | "error";

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

/** Switch to the waiting version. The page reloads once the new worker takes over. */
export function applyUpdate(): void {
  void updateSW?.(true);
}

const ART_PATH = /\/pokemon\/\d+\.(svg|webp|png)$/;

/** Counts cached art and storage use. Cheap enough to poll while the first install runs. */
export async function refreshOfflineStats(): Promise<void> {
  try {
    if (typeof caches !== "undefined") {
      let art = 0;
      for (const name of await caches.keys()) {
        if (!name.includes("precache")) continue;
        const requests = await (await caches.open(name)).keys();
        art = Math.max(art, requests.filter((r) => ART_PATH.test(new URL(r.url).pathname)).length);
      }
      usePwa.setState({ cachedArt: art });
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

function markReady(): void {
  usePwa.setState({ status: "ready" });
  void keepStorage();
  void refreshOfflineStats();
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
  updateSW = registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (registration?.active) markReady();
    },
    onOfflineReady: markReady,
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
