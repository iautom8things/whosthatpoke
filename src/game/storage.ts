/** The part of Web Storage the game uses. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** localStorage, or null where it is missing or blocked (private mode, sandboxed frames, node). */
export function browserStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export interface StoredValue<T> {
  /** The current value. Same reference until the stored text changes. Never throws. */
  read(): T;
  write(value: T): void;
  clear(): void;
}

/**
 * A JSON value kept in storage. Corrupt or invalid data reads as `empty()`. Once storage is
 * missing or a write fails, the value lives in memory for the rest of the page's life.
 */
export function storedValue<T>(
  key: string,
  parse: (data: unknown) => T,
  empty: () => T,
  storage: () => StorageLike | null = browserStorage,
): StoredValue<T> {
  let memory = empty();
  let memoryOnly = false;
  let lastRaw: string | null | undefined;

  const decode = (raw: string | null): T => {
    if (raw == null) return empty();
    try {
      return parse(JSON.parse(raw));
    } catch {
      return empty();
    }
  };

  return {
    read() {
      if (memoryOnly) return memory;
      try {
        const store = storage();
        if (!store) {
          memoryOnly = true;
          return memory;
        }
        const raw = store.getItem(key);
        if (raw !== lastRaw) {
          memory = decode(raw);
          lastRaw = raw;
        }
        return memory;
      } catch {
        memoryOnly = true;
        return memory;
      }
    },
    write(value) {
      memory = value;
      if (memoryOnly) return;
      try {
        const store = storage();
        if (!store) {
          memoryOnly = true;
          return;
        }
        const raw = JSON.stringify(value);
        store.setItem(key, raw);
        lastRaw = raw;
      } catch {
        memoryOnly = true;
      }
    },
    clear() {
      memory = empty();
      if (memoryOnly) return;
      try {
        storage()?.removeItem(key);
        lastRaw = null;
      } catch {
        memoryOnly = true;
      }
    },
  };
}
