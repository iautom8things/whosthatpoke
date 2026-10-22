// Anonymous play counts for Umami Cloud. Each hit is a POST of the JSON Umami's own tracker sends, so no third-party
// script runs. Hits wait in a localStorage outbox until a send gets an answer: a game played offline goes out later,
// under the time it was played and marked late. This file knows nothing about the game; src/metrics.ts says what
// to count.
//
// Nothing here identifies a player: no cookies, no stored ids, nothing anyone types, and the path without its query.
// One random id per page load keeps the phones on one venue Wi-Fi from merging into one visitor. It lives in memory,
// and in the outbox only inside hits still waiting to go, so a game played offline still counts as its own visit.

import { browserStorage, type StorageLike } from "../game/storage";

/**
 * The website id from Umami Cloud (Settings > Websites > Edit), a UUID that is public by design. Empty keeps
 * metrics off.
 */
export const WEBSITE_ID: string = "851b4974-df87-48f1-9dc9-1e4656265333";

const ENDPOINT = "https://gateway.umami.is/api/send";
/** Only the real game counts: not the dev server, a LAN address or `vite preview`. */
const HOSTNAME = "iautom8things.github.io";
export const OUTBOX_KEY = "wtp.metrics.outbox.v1";
/** Hits kept while nothing answers, about 140 games. Past this, new hits are dropped. */
export const OUTBOX_MAX = 2000;
/** A hit sent later than this goes with the time it happened and `late: true`. */
export const LATE_MS = 60_000;
/** A send with no answer after this long counts as no answer, so a stuck request can't hold up the rest. */
const SEND_TIMEOUT_MS = 15_000;
/** While a backlog drains, the outbox is saved at most this often instead of after every hit. */
const SAVE_MS = 1000;
/**
 * Hits sent at once, so a finished game goes out in one round trip and a page closed right after still gets it out.
 * At about 500 bytes each they stay well inside the 64 KB a page may have in keepalive requests.
 */
const BATCH = 50;

export type EventData = Record<string, string | number | boolean | undefined>;

/** What Umami's tracker sends with every hit. */
export interface Page {
  website: string;
  hostname: string;
  /** The path only, never the query string. */
  url: string;
  title: string;
  language: string;
  screen: string;
  referrer: string;
  /** Random, one per page load. */
  id: string;
}

interface Payload extends Page {
  /** Absent on a page view. */
  name?: string;
  data?: EventData;
  /** Unix seconds, only on late hits. Umami dates the others when they arrive. */
  timestamp?: number;
}

/** A hit in the outbox. `at` is when it happened, in milliseconds since the epoch. */
interface Hit {
  at: number;
  payload: Payload;
}

export interface MetricsEnv {
  /** Where the outbox lives across reloads. Null keeps it in memory. */
  storage: StorageLike | null;
  /** POSTs one hit. Resolves to the HTTP status, or null when nothing answered. */
  post(body: string): Promise<number | null>;
  /** Milliseconds since the epoch. */
  now(): number;
  /** Calls `online` when the device is back online, and `hide` when the page is hidden or closed. */
  watch(online: () => void, hide: () => void): void;
}

const isHit = (v: unknown): v is Hit => {
  const h = v as Partial<Hit> | null;
  return typeof h?.at === "number" && typeof h.payload?.website === "string";
};

function readOutbox(storage: StorageLike | null): Hit[] {
  try {
    const data: unknown = JSON.parse(storage?.getItem(OUTBOX_KEY) ?? "[]");
    return Array.isArray(data) ? data.filter(isHit).slice(0, OUTBOX_MAX) : [];
  } catch {
    return [];
  }
}

/** The request body for a hit, shaped like the tracker's. A late hit carries the time it happened. */
function body({ at, payload }: Hit, now: number): string {
  if (now - at <= LATE_MS) return JSON.stringify({ type: "event", payload });
  const late: Payload = { ...payload, timestamp: Math.floor(at / 1000) };
  if (payload.name) late.data = { ...payload.data, late: true };
  return JSON.stringify({ type: "event", payload: late });
}

/** Counted, or refused for good (a wrong website id, a payload Umami rejects). Anything else is tried again later. */
const answered = (status: number | null) => status !== null && status < 500 && status !== 429;

/** The outbox and its sender. No browser in here: the tests give it a fake env. */
export class Metrics {
  private outbox: Hit[];
  /** Hits tracked since the last drain. They join the outbox off the caller's stack, so a game never waits on storage. */
  private pending: Hit[] = [];
  /** Hits posted and waiting for an answer. */
  private sending: Hit[] = [];
  private saveTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly page: Page,
    private readonly env: MetricsEnv,
  ) {
    this.outbox = readOutbox(env.storage);
    // Hidden or closing: save, but send nothing new. A send started now may not outlive the page, and its hits would
    // be gone from storage with nobody left to put them back.
    env.watch(
      () => void this.flush(),
      () => this.drain(),
    );
  }

  pageview(): void {
    this.push({ ...this.page });
  }

  track(name: string, data?: EventData): void {
    this.push({ ...this.page, name, data });
  }

  /** Sends the outbox oldest first, BATCH hits at a time, until it is empty or a send fails. */
  async flush(): Promise<void> {
    if (this.sending.length > 0) return;
    try {
      while (this.outbox.length > 0) {
        const now = this.env.now();
        const batch = this.outbox.slice(0, BATCH);
        this.sending = batch;
        this.save();
        const statuses = await Promise.all(batch.map((hit) => this.env.post(body(hit, now)).catch(() => null)));
        const done = new Set(batch.filter((_, i) => answered(statuses[i])));
        this.outbox = this.outbox.filter((hit) => !done.has(hit));
        this.sending = [];
        this.saveSoon();
        // No answer, a server error or a rate limit: those hits wait for the next push or the next time online.
        if (done.size < batch.length) break;
      }
    } catch {
      // A broken env reads as no answer.
      this.saveSoon();
    } finally {
      this.sending = [];
    }
  }

  private push(payload: Payload): void {
    this.pending.push({ at: this.env.now(), payload });
    if (this.pending.length === 1)
      setTimeout(() => {
        this.drain();
        void this.flush();
      }, 0);
  }

  /** Moves tracked hits into the outbox and saves it. */
  private drain(): void {
    // A full outbox keeps the oldest hits: they are the ones still missing from the dashboard.
    this.outbox.push(...this.pending.slice(0, Math.max(0, OUTBOX_MAX - this.outbox.length)));
    this.pending = [];
    this.save();
  }

  private saveSoon(): void {
    this.saveTimer ??= setTimeout(() => this.save(), SAVE_MS);
  }

  private save(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    // Hits on their way stay out: if the page closes or is killed, keepalive still delivers them, and the next page
    // load must not send them again. A send that fails puts them back with the save after it.
    const waiting = this.outbox.filter((hit) => !this.sending.includes(hit));
    try {
      if (waiting.length > 0) this.env.storage?.setItem(OUTBOX_KEY, JSON.stringify(waiting));
      else this.env.storage?.removeItem(OUTBOX_KEY);
    } catch {
      // Full or blocked storage: the outbox lasts until the page closes. Not noteFailedWrite(): scores still save.
    }
  }
}

export interface Where {
  prod: boolean;
  hostname: string;
  search: string;
  webdriver: boolean;
  websiteId: string;
}

/**
 * The real game only: a production build on its own address with a website id. Never demos and labs, and never
 * ?nostats, which agents add on the live site: navigator.webdriver catches plain Playwright, but playwright-cli and
 * other agent browsers hide it.
 */
export function metricsAllowed({ prod, hostname, search, webdriver, websiteId }: Where): boolean {
  const query = new URLSearchParams(search);
  const qa = webdriver || ["demo", "lab", "nostats"].some((p) => query.has(p));
  return prod && hostname === HOSTNAME && !qa && websiteId !== "";
}

/** Where the visit came from, without its query string or hash. */
function referrerOf(ref: string): string {
  try {
    const url = new URL(ref);
    return url.origin + url.pathname;
  } catch {
    return "";
  }
}

function pageInfo(): Page {
  return {
    website: WEBSITE_ID,
    hostname: location.hostname,
    url: location.pathname,
    title: document.title,
    language: navigator.language,
    screen: `${screen.width}x${screen.height}`,
    referrer: referrerOf(document.referrer),
    id: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
  };
}

function browserEnv(): MetricsEnv {
  return {
    storage: browserStorage(),
    post: async (body) => {
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), SEND_TIMEOUT_MS);
      try {
        // As the tracker sends it: outlives a page that closes, carries no cookies, and names the site in headers.
        const res = await fetch(ENDPOINT, {
          method: "POST",
          body,
          keepalive: true,
          credentials: "omit",
          headers: { "Content-Type": "application/json", "x-umami-website-id": WEBSITE_ID, "x-umami-hostname": location.hostname },
          signal: abort.signal,
        });
        return res.status;
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    },
    now: () => Date.now(),
    watch: (online, hide) => {
      window.addEventListener("online", online);
      window.addEventListener("pagehide", hide);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") hide();
      });
    },
  };
}

let active: Metrics | null = null;

/** Turns counting on where metricsAllowed() says so, and sends what earlier visits left. True when on. */
export function startMetrics(): boolean {
  try {
    if (active) return true;
    const where = {
      prod: import.meta.env.PROD,
      hostname: location.hostname,
      search: location.search,
      webdriver: navigator.webdriver === true,
      websiteId: WEBSITE_ID,
    };
    if (!metricsAllowed(where)) return false;
    active = new Metrics(pageInfo(), browserEnv());
    void active.flush();
    return true;
  } catch {
    active = null;
    return false;
  }
}

/** True when this page counts. Settings says so under About. */
export function metricsOn(): boolean {
  return active !== null;
}

export function pageview(): void {
  try {
    active?.pageview();
  } catch {
    // Counting never gets in the way of the game.
  }
}

export function track(name: string, data?: EventData): void {
  try {
    active?.track(name, data);
  } catch {
    // Counting never gets in the way of the game.
  }
}
