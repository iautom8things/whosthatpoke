// Service worker registration, offline status and Save for offline. Import once from main.tsx for its side effect:
//   import "./pwa";
// Settings reads usePwa() to show how much of the game is saved for offline play.
//
// The worker precaches only the app itself and the core voice lines. Pictures and the other clips are kept as a
// round fetches them, or all at once by saveForOffline() (src/pwa-save.ts). An installed home-screen app starts
// that save by itself.
//
// The worker is in "prompt" mode: a new version waits instead of reloading the page mid-game.
// It applies itself on the splash or title screen, where nobody is mid-game, or when the host taps "Update" in
// Settings. A device that kept a tab open would otherwise play the old version until someone found that button.
import { registerSW } from "virtual:pwa-register";
import { create } from "zustand";
import { CATALOG } from "./data/catalog";
import { network } from "./lib/network";
import { ART_CACHE, countSaved, saveAll, VOICE_CACHE, voiceFiles, type SaveJob, type Tally } from "./pwa-save";
import { useNav } from "./state/nav";

/** Set by vite.config.ts: whether public/voice/index.json existed at build. */
declare const __VOICE_INDEX__: boolean | undefined;

export type OfflineStatus =
  | "dev" // vite dev server: no service worker
  | "unsupported" // no service worker here (plain http on a LAN address, old browser)
  | "installing" // first visit: saving the app itself
  | "reload" // saved, but this tab opened before the worker and still loads from the network
  | "ready" // the worker runs this tab; whatever is saved works with no network
  | "error"; // installing the worker failed, e.g. the Wi-Fi dropped partway through

export interface PwaState {
  status: OfflineStatus;
  /** A newer version is downloaded and waiting. applyUpdate() switches to it. */
  needRefresh: boolean;
  /** Pokémon pictures saved on this device. null until counted. */
  art: number | null;
  /** Voice clip files saved. null until counted. */
  voice: number | null;
  /** Clip files voice/index.json lists, 0 with no recorded voice. null until read. */
  voiceTotal: number | null;
  /** saveForOffline() is running. Kept here, so it keeps going while the host switches tabs or leaves Settings. */
  saving: boolean;
  /** Why the last save ended short, when it did. A stop from the host is not a failure. */
  saveFailed: "network" | "full" | null;
  /** This device saved everything once, so anything missing now was cleared by the browser. */
  savedOnce: boolean;
  /** Bytes this site keeps on the device, when the browser says. */
  usage: number | null;
  /** The browser promised not to clear the cache under storage pressure. */
  persisted: boolean | null;
}

const SAVED_KEY = "wtp-offline-saved";

function readSavedOnce(): boolean {
  try {
    return localStorage.getItem(SAVED_KEY) === "1";
  } catch {
    return false;
  }
}

export const usePwa = create<PwaState>(() => ({
  status: "installing",
  needRefresh: false,
  art: null,
  voice: null,
  voiceTotal: null,
  saving: false,
  saveFailed: null,
  savedOnce: typeof window !== "undefined" && readSavedOnce(),
  usage: null,
  persisted: null,
}));

const ART = [...new Set(CATALOG.map((m) => m.art))];
export const ART_TOTAL = ART.length;

/** True when every picture and clip is saved. */
export function allSaved({ art, voice, voiceTotal }: Pick<PwaState, "art" | "voice" | "voiceTotal">): boolean {
  return art !== null && art >= ART_TOTAL && voice !== null && voiceTotal !== null && voice >= voiceTotal;
}

/** Opened from the Home Screen instead of a browser tab. */
export function isInstalled(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || matchMedia("(display-mode: standalone), (display-mode: fullscreen)").matches;
}

/** Cache keys are absolute URLs. */
const absolute = (path: string) => new URL(`${import.meta.env.BASE_URL}${path}`, document.baseURI).href;
let voiceList: Promise<string[] | null> | null = null;

/** Every clip file index.json lists, as absolute URLs. Null when the index can't be read (offline before it was saved). */
function voiceUrls(): Promise<string[] | null> {
  if (typeof __VOICE_INDEX__ === "undefined" || !__VOICE_INDEX__) return Promise.resolve([]);
  voiceList ??= fetch(absolute("voice/index.json"))
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((index) => voiceFiles(index).map((name) => absolute(`voice/${name}`)))
    .catch(() => {
      voiceList = null; // try again next time
      return null;
    });
  return voiceList;
}

const jobs = (voice: readonly string[]): SaveJob[] => [
  { cache: ART_CACHE, urls: ART.map(absolute) },
  { cache: VOICE_CACHE, urls: voice },
];

let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;
let registration: ServiceWorkerRegistration | undefined;

/** Switch to the waiting version. The page reloads once the new worker takes over. */
export function applyUpdate(): void {
  void updateSW?.(true);
}

/** Screens where nobody is mid-game, so a waiting update can reload there. A reload lands on "Tap to play". */
const IDLE_SCREENS: ReadonlySet<string> = new Set(["splash", "title"]);

/** Applies a waiting update when the game is idle and no save for offline is running. */
function applyWhenIdle(): void {
  const { needRefresh, saving } = usePwa.getState();
  if (needRefresh && !saving && IDLE_SCREENS.has(useNav.getState().screen)) applyUpdate();
}

let statsRun = 0;
let statsShown = 0;

/** Show a count unless a newer one (or a save's own progress) already did. */
function showCounts(run: number, [art, voice]: Tally[], voiceKnown = true): void {
  if (run <= statsShown) return;
  statsShown = run;
  usePwa.setState({ art: art.have, voice: voiceKnown ? voice.have : null, voiceTotal: voiceKnown ? voice.total : null });
}

async function refreshUsage(): Promise<void> {
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (estimate?.usage != null) usePwa.setState({ usage: estimate.usage });
  } catch {
    // Storage APIs can throw in private mode. The status line still works without numbers.
  }
}

/** Counts saved pictures and clips, and storage use. Settings calls it on every visit. */
export async function refreshOfflineStats(): Promise<void> {
  // No worker in dev, and ?demo=settings&pwa=... sets the numbers itself.
  if (import.meta.env.DEV) return;
  const run = ++statsRun;
  try {
    if (typeof caches !== "undefined" && !usePwa.getState().saving) {
      const voice = await voiceUrls();
      showCounts(run, await countSaved(jobs(voice ?? [])), voice !== null);
    }
  } catch {
    // Storage APIs can throw in private mode. The status line still works without numbers.
  }
  await refreshUsage();
}

async function keepStorage(): Promise<void> {
  try {
    const persisted = (await navigator.storage?.persisted?.()) || (await navigator.storage?.persist?.());
    usePwa.setState({ persisted: Boolean(persisted) });
  } catch {
    usePwa.setState({ persisted: false });
  }
}

let saveRun: AbortController | null = null;
/** Progress repaints Settings at most this often: thousands of files would otherwise mean thousands of renders. */
const PROGRESS_MS = 250;

/**
 * Downloads every picture and clip not saved yet. Runs from the page, so it works before the worker controls the
 * tab too. `background` (the installed app's own save) uses fewer connections, so a round's fetches go first.
 */
export function saveForOffline({ background = false } = {}): void {
  if (import.meta.env.DEV || saveRun || typeof caches === "undefined") return;
  const run = (saveRun = new AbortController());
  usePwa.setState({ saving: true, saveFailed: null });
  void keepStorage();
  void (async () => {
    let failed: PwaState["saveFailed"] = "network";
    try {
      const voice = await voiceUrls();
      if (voice) {
        let shown = 0;
        const result = await saveAll(jobs(voice), {
          concurrency: background ? 3 : 6,
          signal: run.signal,
          onProgress: (tallies) => {
            if (Date.now() - shown < PROGRESS_MS) return;
            shown = Date.now();
            showCounts(++statsRun, tallies);
          },
        });
        showCounts(++statsRun, result.tallies);
        const done = allSaved(usePwa.getState());
        failed = done || result.stopped === "cancelled" ? null : result.stopped === "full" ? "full" : "network";
        if (done) {
          usePwa.setState({ savedOnce: true });
          try {
            localStorage.setItem(SAVED_KEY, "1");
          } catch {
            // No storage: a later shortfall reads as "not saved yet" instead of "cleared".
          }
        }
      }
    } catch {
      // saveAll never throws; this is the index fetch or a storage API in private mode.
    }
    saveRun = null;
    usePwa.setState({ saving: false, saveFailed: failed });
    void refreshUsage();
  })();
}

/** Ends a running save. What it already saved stays. */
export function stopSaving(): void {
  saveRun?.abort();
}

/** The installed app waits this long after it is ready, so the first screen and round load first. */
const AUTO_SAVE_MS = 5000;
let autoSave: ReturnType<typeof setTimeout> | undefined;

/** An installed home-screen app saves everything by itself, unless the connection is cellular-slow or metered. */
function scheduleAutoSave(): void {
  if (autoSave !== undefined || !isInstalled()) return;
  autoSave = setTimeout(() => {
    // network.quality covers iOS too, which has no navigator.connection: it also measures what downloads take.
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (network.quality !== "good" || conn?.saveData) return;
    saveForOffline({ background: true });
  }, AUTO_SAVE_MS);
}

let settle: ReturnType<typeof setTimeout> | undefined;

/**
 * "ready" only once the worker controls this tab: an uncontrolled tab loads every picture from the network and
 * never reads the caches, so it shows "?" offline even with everything saved.
 */
function syncStatus(): void {
  if (!registration?.active) return; // Still installing. watch() reports a failed install.
  clearTimeout(settle);
  if (navigator.serviceWorker.controller) {
    if (usePwa.getState().status !== "ready") {
      usePwa.setState({ status: "ready" });
      void keepStorage();
      void refreshOfflineStats();
      scheduleAutoSave();
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
    // A first install that fails (a download dropped) discards the worker and fires nothing else, so without
    // this the card would say "Setting up" forever.
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
  // Back on the title screen after a game, or a save just ended: a waiting update applies then.
  useNav.subscribe(applyWhenIdle);
  usePwa.subscribe((s, prev) => prev.saving && !s.saving && applyWhenIdle());
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
      syncStatus();
    },
    onNeedRefresh() {
      usePwa.setState({ needRefresh: true });
      applyWhenIdle();
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
