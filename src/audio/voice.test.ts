import { describe, expect, it } from "vitest";
import type { NetQuality } from "../lib/network";
import type { Line } from "./lines";
import { Voice } from "./voice";

const flush = () => new Promise((r) => setTimeout(r, 0));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

/**
 * Clips that are recorded (and decoded) when the test says so. Each play waits until the test ends it. A recorded
 * clip is on the device unless it is in `remote`: then only a prepare() or fetch() allowed to download gets it.
 */
class FakeClips {
  available = true;
  recorded = new Set<string>();
  remote = new Set<string>();
  /** prepare() for these keys waits on the deferred instead of answering at once. */
  slow = new Map<string, ReturnType<typeof deferred<boolean>>>();
  played: string[][] = [];
  fetched: { keys: string[]; download: boolean }[] = [];
  stopped = 0;
  private ends: (() => void)[] = [];

  has = (keys: readonly string[]) => keys.length > 0 && keys.every((k) => this.recorded.has(k));
  ready = (keys: readonly string[]) => this.has(keys) && keys.every((k) => !this.remote.has(k));
  load = () => Promise.resolve();
  fetch = (keys: readonly string[], opts: { download?: boolean } = {}) => {
    this.fetched.push({ keys: [...keys], download: opts.download ?? true });
    return Promise.resolve(true);
  };
  prepare = (keys: readonly string[], _deadline?: number, opts: { download?: boolean } = {}) =>
    this.slow.get(keys.join())?.promise ?? Promise.resolve(this.has(keys) && (opts.download !== false || this.ready(keys)));
  play = (keys: readonly string[]) => {
    this.played.push([...keys]);
    const end = deferred();
    this.ends.push(end.resolve);
    return {
      done: end.promise,
      stop: () => {
        this.stopped++;
        end.resolve();
      },
    };
  };
  /** The playing clip reaches its end. */
  end = async () => {
    this.ends.shift()?.();
    await flush();
  };
}

/** A device voice whose lines last until the test ends them or cancel() cuts them. */
class FakeSpeech {
  supported = true;
  said: string[] = [];
  private finish: (() => void) | null = null;
  say = (text: string) => {
    this.said.push(text);
    this.finish?.();
    const d = deferred();
    this.finish = d.resolve;
    return d.promise;
  };
  cancel = () => {
    this.finish?.();
    this.finish = null;
  };
  setEnabled = () => {};
  warmUp = () => {};
  end = async () => {
    this.cancel();
    await flush();
  };
}

function setup(recorded: string[] = [], net: { quality: NetQuality } = { quality: "good" }) {
  const clips = new FakeClips();
  for (const k of recorded) clips.recorded.add(k);
  const speech = new FakeSpeech();
  const ducks: boolean[] = [];
  const voice = new Voice(clips, speech, (on) => ducks.push(on), () => net.quality);
  return { clips, speech, ducks, voice, net };
}

/** Watches a say() promise without awaiting it. */
function track(p: Promise<void>) {
  const t = { done: false };
  void p.then(() => (t.done = true));
  return t;
}

const reveal: Line = { text: "It’s Pikachu!", clips: ["reveal.25"] };
const fact: Line = { text: "It zaps.", clips: ["fact.25"], pauseMs: 10, extra: true };

describe("recorded announcer", () => {
  it("plays the clip and resolves when it ends, ducking the music meanwhile", async () => {
    const { clips, speech, ducks, voice } = setup(["reveal.25"]);
    const said = track(voice.say(reveal));
    await flush();
    expect(clips.played).toEqual([["reveal.25"]]);
    expect(speech.said).toEqual([]);
    expect(said.done).toBe(false);
    expect(ducks).toEqual([true]);
    await clips.end();
    expect(said.done).toBe(true);
    await sleep(200);
    expect(ducks).toEqual([true, false]);
  });

  it("chains the `then` line after a pause", async () => {
    const { clips, voice } = setup(["reveal.25", "fact.25"]);
    const said = track(voice.say({ ...reveal, then: fact }));
    await flush();
    await clips.end();
    expect(clips.played).toEqual([["reveal.25"]]);
    await sleep(30);
    expect(clips.played).toEqual([["reveal.25"], ["fact.25"]]);
    expect(said.done).toBe(false);
    await clips.end();
    expect(said.done).toBe(true);
  });

  it("cancel() resolves at once and stops the `then` chain", async () => {
    const { clips, voice } = setup(["reveal.25", "fact.25"]);
    const said = track(voice.say({ ...reveal, then: fact }));
    await flush();
    voice.cancel();
    await flush();
    expect(said.done).toBe(true);
    expect(clips.stopped).toBe(1);
    await sleep(30);
    expect(clips.played).toEqual([["reveal.25"]]);
  });

  it("cancel() resolves a line that is still decoding, and it never plays", async () => {
    const { clips, voice } = setup(["reveal.25"]);
    const decoding = deferred<boolean>();
    clips.slow.set("reveal.25", decoding);
    const said = track(voice.say(reveal));
    await flush();
    voice.cancel();
    await flush();
    expect(said.done).toBe(true);
    decoding.resolve(true);
    await flush();
    expect(clips.played).toEqual([]);
  });

  it("unqueue drops only the delayed line", async () => {
    const { clips, voice } = setup(["reveal.25", "line.whos-that"]);
    const now = voice.say(reveal);
    const playing = track(now);
    await flush();
    voice.unqueue(now);
    await flush();
    expect(playing.done).toBe(false);

    const later = voice.say({ text: "Who’s that Pokémon?", clips: ["line.whos-that"] }, 20);
    const queued = track(later);
    voice.unqueue(Promise.resolve());
    await flush();
    expect(queued.done).toBe(false);
    voice.unqueue(later);
    await flush();
    expect(queued.done).toBe(true);
    await sleep(40);
    expect(clips.played).toEqual([["reveal.25"]]);
  });

  it("cancel() leaves a delayed line queued", async () => {
    const { clips, voice } = setup(["line.whos-that"]);
    const queued = track(voice.say({ text: "Who’s that Pokémon?", clips: ["line.whos-that"] }, 20));
    voice.cancel();
    await sleep(40);
    expect(clips.played).toEqual([["line.whos-that"]]);
    expect(queued.done).toBe(false);
  });

  it("speaks the whole text when a clip is missing", async () => {
    const { clips, speech, ducks, voice } = setup(["choice.first.25", "choice.mid.1", "choice.last.7"]);
    const choices: Line = { text: "Is it A, B, C, or D?", clips: ["choice.first.25", "choice.mid.1", "choice.mid.4", "choice.last.7"] };
    const said = track(voice.say(choices));
    // Speech starts in the same task, as it did before recordings existed.
    expect(speech.said).toEqual(["Is it A, B, C, or D?"]);
    expect(clips.played).toEqual([]);
    expect(ducks).toEqual([]);
    await speech.end();
    expect(said.done).toBe(true);
  });

  it("leaves a recorded line out when its clip does not arrive in time, never using the device voice", async () => {
    const { clips, speech, voice } = setup(["reveal.25"]);
    clips.slow.set("reveal.25", deferred<boolean>());
    clips.slow.get("reveal.25")!.resolve(false);
    const said = track(voice.say(reveal));
    await flush();
    expect(speech.said).toEqual([]);
    expect(clips.played).toEqual([]);
    expect(said.done).toBe(true);
  });

  it("plays a recorded line that arrives late instead of speaking it", async () => {
    const { clips, speech, voice } = setup(["reveal.25"]);
    const arriving = deferred<boolean>();
    clips.slow.set("reveal.25", arriving);
    void voice.say(reveal);
    await sleep(20);
    expect(speech.said).toEqual([]);
    arriving.resolve(true);
    await flush();
    expect(clips.played).toEqual([["reveal.25"]]);
    expect(speech.said).toEqual([]);
  });

  it("falls back part by part: a spoken score, then a recorded prize", async () => {
    const { clips, speech, voice } = setup(["prize.ace-trainer-big-candy"]);
    const results: Line = {
      text: "You got 7 out of 9!",
      clips: [],
      then: { text: "Ace Trainer! big candy!", clips: ["prize.ace-trainer-big-candy"], pauseMs: 10 },
    };
    const said = track(voice.say(results));
    expect(speech.said).toEqual(["You got 7 out of 9!"]);
    await speech.end();
    await sleep(30);
    expect(clips.played).toEqual([["prize.ace-trainer-big-candy"]]);
    await clips.end();
    expect(said.done).toBe(true);
  });

  it("plays the stand-in for a prize that was never recorded", async () => {
    const { clips, speech, voice } = setup(["prize.custom"]);
    void voice.say({ text: "Ghost Queen! Two treats!", clips: ["prize.ghost-queen-two-treats"], standIn: ["prize.custom"] });
    await flush();
    expect(clips.played).toEqual([["prize.custom"]]);
    expect(speech.said).toEqual([]);
  });

  it("never plays a line that was replaced while it decoded", async () => {
    const { clips, voice } = setup(["reveal.25", "reveal.1"]);
    const decoding = deferred<boolean>();
    clips.slow.set("reveal.25", decoding);
    const first = track(voice.say(reveal));
    await flush();
    const second = track(voice.say({ text: "It’s Bulbasaur!", clips: ["reveal.1"] }));
    await flush();
    expect(first.done).toBe(true);
    expect(clips.played).toEqual([["reveal.1"]]);
    decoding.resolve(true);
    await flush();
    expect(clips.played).toEqual([["reveal.1"]]);
    expect(second.done).toBe(false);
  });

  it("a recorded line cuts off a spoken one", async () => {
    const { clips, speech, voice } = setup(["reveal.1"]);
    const spoken = track(voice.say("Free text"));
    void voice.say({ text: "It’s Bulbasaur!", clips: ["reveal.1"] });
    await flush();
    expect(spoken.done).toBe(true);
    expect(clips.played).toEqual([["reveal.1"]]);
    expect(speech.said).toEqual(["Free text"]);
  });

  it("stays quiet with the voice off", async () => {
    const { clips, speech, voice } = setup(["reveal.25"]);
    voice.setEnabled(false);
    await voice.say(reveal);
    await voice.say("Hello");
    expect(clips.played).toEqual([]);
    expect(speech.said).toEqual([]);
  });
});

describe("the Pokédex entry (an extra line)", () => {
  const revealThenFact: Line = { ...reveal, then: fact };

  it("plays from its clip after the name", async () => {
    const { clips, speech, voice } = setup(["reveal.25", "fact.25"]);
    void voice.say(revealThenFact);
    await flush();
    await clips.end();
    await sleep(30);
    expect(clips.played).toEqual([["reveal.25"], ["fact.25"]]);
    expect(speech.said).toEqual([]);
  });

  it("is never said in the device voice while recordings are in use", async () => {
    const { clips, speech, voice } = setup(["reveal.25"]);
    expect(voice.skips(fact)).toBe(true);
    const said = track(voice.say(revealThenFact));
    await flush();
    await clips.end();
    await sleep(30);
    expect(clips.played).toEqual([["reveal.25"]]);
    expect(speech.said).toEqual([]);
    expect(said.done).toBe(true);
  });

  it("is left out on a poor connection when its clip is not on the device", async () => {
    const { clips, speech, voice } = setup(["reveal.25", "fact.25"], { quality: "poor" });
    clips.remote.add("fact.25");
    expect(voice.skips(fact)).toBe(true);
    const said = track(voice.say(revealThenFact));
    await flush();
    await clips.end();
    await sleep(30);
    expect(clips.played).toEqual([["reveal.25"]]);
    expect(speech.said).toEqual([]);
    expect(said.done).toBe(true);
  });

  it("still plays on a poor connection when its clip is on the device", async () => {
    const { clips, voice } = setup(["reveal.25", "fact.25"], { quality: "poor" });
    expect(voice.skips(fact)).toBe(false);
    void voice.say(revealThenFact);
    await flush();
    await clips.end();
    await sleep(30);
    expect(clips.played).toEqual([["reveal.25"], ["fact.25"]]);
  });

  it("is said by the device voice as before when there are no recordings", async () => {
    const { clips, speech, voice } = setup();
    clips.available = false;
    expect(voice.skips(fact)).toBe(false);
    void voice.say(fact);
    expect(speech.said).toEqual(["It zaps."]);
  });

  it("is not downloaded ahead unless the connection is good", async () => {
    const choices: Line = { text: "Is it A or B?", clips: ["choice.first.25", "choice.last.1"] };
    const { clips, voice, net } = setup(["reveal.25", "fact.25", "choice.first.25", "choice.last.1"], { quality: "good" });
    await voice.prefetch([reveal, fact, choices]);
    expect(clips.fetched).toEqual([
      { keys: ["reveal.25"], download: true },
      { keys: ["fact.25"], download: true },
      { keys: ["choice.first.25", "choice.last.1"], download: true },
    ]);
    clips.fetched = [];
    net.quality = "poor";
    await voice.prefetch([revealThenFact, choices]);
    expect(clips.fetched.map((f) => f.keys)).toEqual([["reveal.25"], ["choice.first.25", "choice.last.1"]]);
    clips.fetched = [];
    net.quality = "offline";
    await voice.prefetch([revealThenFact]);
    expect(clips.fetched).toEqual([{ keys: ["reveal.25"], download: false }]);
  });
});
