// After an update, a tab still running the old build asks for chunks that are gone. main.tsx calls
// this on Vite's "vite:preloadError" so the tab reloads into the new build instead of the Oops card.

/** sessionStorage: when this tab last reloaded for a chunk that failed to load. */
export const CHUNK_RELOAD_KEY = "wtp.chunkReload";
/** A second failure this soon after that reload means reloading won't fix it. */
const LOOP_GUARD_MS = 30_000;

export interface ChunkReloadEnv {
  storage: Pick<Storage, "getItem" | "setItem">;
  now: number;
  online: boolean;
  reload: () => void;
}

/**
 * Reloads once for a missing chunk. Offline, or again within 30 s, it leaves the Oops card up, so a
 * dropped network never swaps the game for the browser's error page and a broken build never loops.
 * Returns true when it reloaded.
 */
export function reloadForMissingChunk({ storage, now, online, reload }: ChunkReloadEnv): boolean {
  if (!online) return false;
  const last = Number(storage.getItem(CHUNK_RELOAD_KEY));
  if (last > 0 && now - last < LOOP_GUARD_MS) return false;
  storage.setItem(CHUNK_RELOAD_KEY, String(now));
  reload();
  return true;
}
