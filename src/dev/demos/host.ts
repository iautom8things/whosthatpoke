// Demo states for host mode and the showcase. Open with ?demo=<name>.
import { monByDex } from "../../data/catalog";
import type { ScoreEntry } from "../../game/leaderboard";
import { useNav, type Screen } from "../../state/nav";
import { useSession } from "../../state/session";
import { hostDemo, markHostHelpSeen, showcaseDemo, type ShowcaseStart } from "../../ui/screens/host/flags";
import { registerDemo } from "../demos";

const params = () => new URLSearchParams(location.search);
const seedParam = () => Number(params().get("seed") ?? 7) || 7;
/** ?dex=740 puts a specific Pokémon on the current card (long-name checks). */
const dexParam = () => Number(params().get("dex")) || null;

function forceDex() {
  const dex = dexParam();
  const { current } = useSession.getState();
  if (dex && current) useSession.setState({ current: { ...current, answer: monByDex(dex) } });
}

function show(screen: Screen) {
  useNav.setState({ screen, history: ["title"] });
}

function startHost() {
  const session = useSession.getState();
  session.setSetup({ mode: "host", categoryId: "all", difficulty: "easy" });
  session.start(seedParam());
  show("host");
}

/** Plays `n` cards (alternating got it / missed) so the tally and dots have something in them. */
function playCards(n: number) {
  const session = useSession.getState();
  for (let i = 0; i < n; i++) {
    session.beginAsking();
    session.judge(i % 3 !== 2);
    session.next();
  }
}

registerDemo("host", () => {
  markHostHelpSeen();
  startHost();
  forceDex();
});

registerDemo("host-midgame", () => {
  markHostHelpSeen();
  startHost();
  playCards(4);
});

registerDemo("host-revealed", () => {
  markHostHelpSeen();
  hostDemo.holdReveal = true;
  startHost();
  playCards(3);
  forceDex();
  useSession.getState().beginAsking();
  useSession.getState().judge(true);
});

registerDemo("host-missed", () => {
  markHostHelpSeen();
  hostDemo.holdReveal = true;
  startHost();
  playCards(5);
  forceDex();
  useSession.getState().beginAsking();
  useSession.getState().judge(false);
});

registerDemo("host-help", () => {
  markHostHelpSeen(false);
  startHost();
});

const NAMES = ["Ava", "Leo & Dad", "Mia", "Noah", "Zoe"];
const BUDDIES = [25, 94, 6, 133, 39];

function fakeEntries(): ScoreEntry[] {
  const at = Date.now() - 30 * 60 * 1000;
  return NAMES.map((name, i) => ({
    id: `demo-${i}`,
    name,
    buddy: BUDDIES[i],
    mode: "classic",
    points: 4200 - i * 650 - (i % 2) * 110,
    correct: 10 - i,
    total: 10,
    bestStreak: 8 - i,
    difficulty: "easy",
    categoryId: "all",
    at: at + i * 60_000,
  }));
}

function startShowcase(start: ShowcaseStart, hold: boolean, entries?: ScoreEntry[]) {
  showcaseDemo.start = start;
  showcaseDemo.hold = hold;
  showcaseDemo.seed = seedParam();
  showcaseDemo.entries = entries;
  const dex = dexParam();
  showcaseDemo.firstMon = dex ? monByDex(dex) : undefined;
  showcaseDemo.speed = Number(params().get("speed")) || 1;
  show("showcase");
}

registerDemo("showcase", () => startShowcase("ask", false));
registerDemo("showcase-reveal", () => startShowcase("reveal", true));
registerDemo("showcase-leaderboard", () => startShowcase("board", true, fakeEntries()));
registerDemo("showcase-empty", () => startShowcase("board", true, []));
registerDemo("showcase-cta", () => startShowcase("cta", true));
