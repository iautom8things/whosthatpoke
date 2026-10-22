// The announcer: a speechSynthesis wrapper that picks the best English voice, ducks the game audio while it
// talks, stays quiet while the tab is hidden, and always resolves (iOS sometimes never fires onend).

import type { Announcer } from "./index";

const VOICE_KEY = "wtp.voice.v1";
const RATE = 1.0;
const PITCH = 1.1;

export interface VoiceInfo {
  /** voiceURI: unique, unlike names (WebKit lists several "Samantha"s). */
  id: string;
  name: string;
  lang: string;
  local: boolean;
  score: number;
}

// macOS novelty and low-fidelity voices. They work, but nobody wants Zarvox announcing Pikachu.
const NOVELTY =
  /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|deranged|hysterical|junior|ralph|fred|kathy|princess)\b/;
const ELOQUENCE = /\b(eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley)\b/;
const GOOD_NAMES = /\b(ava|zoe|samantha|allison|susan|evan|nathan|joelle|noelle|aria|jenny|guy|nicky|tom)\b/;

export function scoreVoice(v: Pick<SpeechSynthesisVoice, "name" | "lang" | "localService" | "default">, online = true): number {
  const lang = v.lang.replace("_", "-").toLowerCase();
  if (!lang.startsWith("en")) return -1000;
  const name = v.name.toLowerCase();
  let s = lang === "en-us" ? 30 : /^en-(gb|au|ca|ie|nz)/.test(lang) ? 12 : 5;
  if (name.includes("premium")) s += 50;
  if (name.includes("enhanced")) s += 40;
  if (/neural|natural/.test(name)) s += 45;
  // Chrome's Google voices stream from the network: great online, silent in a driveway with no signal.
  if (name.includes("google us english")) s += online ? 38 : -40;
  if (GOOD_NAMES.test(name)) s += 22;
  if (NOVELTY.test(name)) s -= 100;
  if (ELOQUENCE.test(name)) s -= 40;
  if (name.includes("compact")) s -= 10;
  if (v.localService) s += 12;
  if (v.default) s += 3;
  return s;
}

/** Fallback for when onend never fires: generous, based on text length. */
const estimateMs = (text: string) => Math.min(12000, Math.max(2000, 1200 + text.length * 80));

function readPref(): string | null {
  try {
    return localStorage.getItem(VOICE_KEY);
  } catch {
    return null;
  }
}

export class Speech implements Announcer {
  readonly supported: boolean;
  private enabled = true;
  private voices: SpeechSynthesisVoice[] = [];
  private preferred: string | null = readPref();
  private readonly bad = new Set<string>();
  private current: { finish: () => void } | null = null;
  /**
   * A line waiting for its delay. A newer line, a hidden tab, voice off or unqueue() drops it, but not cancel():
   * a screen that is leaving cancels late, after the next screen has queued its line.
   */
  private queued: { timer: ReturnType<typeof setTimeout>; resolve: () => void; done: Promise<void> } | null = null;
  private warmed = false;
  private releaseTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly duck: (on: boolean) => void) {
    this.supported =
      typeof window !== "undefined" && "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance === "function";
    if (!this.supported) return;
    this.loadVoices();
    const synth = window.speechSynthesis;
    const onChange = () => {
      this.loadVoices();
      this.emit();
    };
    if (typeof synth.addEventListener === "function") synth.addEventListener("voiceschanged", onChange);
    else (synth as SpeechSynthesis).onvoiceschanged = onChange;
    // The engine suspends on hide; speech is not Web Audio, so stop it here or the room hears a line with no game.
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) return;
      this.dropQueued();
      this.cancel();
    });
  }

  say(text: string, delayMs = 0): Promise<void> {
    this.dropQueued();
    if (!this.supported || !this.enabled || !text || !text.trim() || document.hidden) return Promise.resolve();
    if (delayMs > 0) {
      let resolve = () => {};
      const done = new Promise<void>((r) => (resolve = r));
      const timer = setTimeout(() => {
        this.queued = null;
        void this.say(text).then(resolve);
      }, delayMs);
      this.queued = { timer, resolve, done };
      return done;
    }
    try {
      const synth = window.speechSynthesis;
      const busy = synth.speaking || synth.pending || this.current !== null;
      this.cancel();
      return new Promise<void>((resolve) => {
        let done = false;
        let retried = false;
        const finish = () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          if (this.current?.finish === finish) this.current = null;
          this.release();
          resolve();
        };
        const timer = setTimeout(finish, estimateMs(text));
        const speak = (delay: number) => {
          const u = new SpeechSynthesisUtterance(text);
          const v = this.pick();
          if (v) u.voice = v;
          u.lang = v?.lang ?? "en-US";
          u.rate = RATE;
          u.pitch = PITCH;
          u.volume = 1;
          u.onend = finish;
          u.onerror = (e) => {
            const err = (e as SpeechSynthesisErrorEvent).error;
            // A network voice failed (no signal at the party): drop it and retry once with the next best.
            if (!retried && !done && v && !v.localService && err !== "interrupted" && err !== "canceled") {
              retried = true;
              this.bad.add(v.voiceURI || v.name);
              speak(0);
              return;
            }
            finish();
          };
          const go = () => {
            if (done) return;
            try {
              if (synth.paused) synth.resume();
              synth.speak(u);
            } catch {
              finish();
            }
          };
          // Chrome can drop a speak() that lands right after cancel().
          if (delay) setTimeout(go, delay);
          else go();
        };
        this.current = { finish };
        this.hold();
        speak(busy ? 60 : 0);
      });
    } catch {
      this.release();
      return Promise.resolve();
    }
  }

  /** Drop a delayed line from say() before it starts, if it is still waiting. */
  unqueue(line: Promise<void>): void {
    if (this.queued?.done === line) this.dropQueued();
  }

  cancel(): void {
    try {
      const c = this.current;
      this.current = null;
      c?.finish();
      if (this.supported) window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (on) return;
    this.dropQueued();
    this.cancel();
  }

  /** Call inside a user gesture: iOS only lets speech start from one, after that it is free. */
  warmUp(): void {
    if (!this.supported || this.warmed) return;
    this.warmed = true;
    try {
      this.loadVoices();
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      window.speechSynthesis.speak(u);
    } catch {
      // ignore
    }
  }

  // ---------- voice picking, also used by the sound lab ----------

  listVoices(): VoiceInfo[] {
    const online = typeof navigator === "undefined" || navigator.onLine !== false;
    return this.voices
      .map((v) => ({ id: v.voiceURI || v.name, name: v.name, lang: v.lang, local: v.localService, score: scoreVoice(v, online) }))
      .filter((v) => v.score > -1000)
      .sort((a, b) => b.score - a.score);
  }

  /** The voice say() will use right now. */
  get voiceName(): string | null {
    return this.pick()?.name ?? null;
  }

  get preferredVoice(): string | null {
    return this.preferred;
  }

  /** Pin a voice by id (voiceURI; null = automatic). Saved on this device. */
  setPreferredVoice(id: string | null): void {
    this.preferred = id;
    try {
      if (id) localStorage.setItem(VOICE_KEY, id);
      else localStorage.removeItem(VOICE_KEY);
    } catch {
      // ignore
    }
    this.emit();
  }

  onVoicesChanged(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private loadVoices(): void {
    try {
      const list = window.speechSynthesis.getVoices();
      if (list.length) this.voices = list;
    } catch {
      // ignore
    }
  }

  private emit(): void {
    for (const cb of this.listeners) cb();
  }

  private pick(): SpeechSynthesisVoice | null {
    if (!this.voices.length) this.loadVoices();
    const usable = this.voices.filter((v) => !this.bad.has(v.voiceURI || v.name));
    if (this.preferred) {
      const v = usable.find((x) => (x.voiceURI || x.name) === this.preferred);
      if (v) return v;
    }
    const online = typeof navigator === "undefined" || navigator.onLine !== false;
    let best: SpeechSynthesisVoice | null = null;
    let bestScore = -1000;
    for (const v of usable) {
      const s = scoreVoice(v, online);
      if (s > bestScore) {
        best = v;
        bestScore = s;
      }
    }
    return best;
  }

  private dropQueued(): void {
    const q = this.queued;
    this.queued = null;
    if (!q) return;
    clearTimeout(q.timer);
    q.resolve();
  }

  private hold(): void {
    if (this.releaseTimer) clearTimeout(this.releaseTimer);
    this.releaseTimer = null;
    this.duck(true);
  }

  private release(): void {
    if (this.releaseTimer) clearTimeout(this.releaseTimer);
    this.releaseTimer = setTimeout(() => {
      this.releaseTimer = null;
      if (!this.current) this.duck(false);
    }, 150);
  }
}
