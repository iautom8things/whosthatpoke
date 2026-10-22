// ?demo=settings opens the host panel (add &tab=look, &tab=offline, ... for another tab).
// ?demo=settings-prizes opens it on the prize editor.
// ?demo=settings-party opens Party tools with 14 scores tonight and one from last week.
// Any settings demo: &storage=broken shows the "scores won't be saved" line.
// Offline cards, dev server only (a real service worker overrides them in a build):
//   &tab=offline&pwa=installing|reload|ready|error&art=<pictures saved>
import { LEADERBOARD_KEY, type ScoreEntry } from "../../game/leaderboard";
import { noteFailedWrite } from "../../game/storage";
import { usePwa, type OfflineStatus } from "../../pwa";
import { useNav } from "../../state/nav";
import { setSettingsTab, SETTINGS_TABS, type SettingsTab } from "../../ui/screens/settings/tabs";
import { registerDemo } from "../demos";

const PWA_STATUSES: OfflineStatus[] = ["installing", "reload", "ready", "error"];

function openSettings(fallback: SettingsTab): void {
  const params = new URLSearchParams(location.search);
  const asked = params.get("tab") as SettingsTab | null;
  setSettingsTab(asked && SETTINGS_TABS.includes(asked) ? asked : fallback);
  const pwa = params.get("pwa") as OfflineStatus | null;
  if (pwa && PWA_STATUSES.includes(pwa)) {
    const art = Number(params.get("art"));
    usePwa.setState({ status: pwa, cachedArt: params.has("art") && Number.isFinite(art) ? art : null, usage: 31_000_000 });
  }
  if (params.get("storage") === "broken") noteFailedWrite();
  useNav.setState({ screen: "settings", history: ["title"] });
}

registerDemo("settings", () => openSettings("sound"));
registerDemo("settings-prizes", () => openSettings("prizes"));

const PARTY_NAMES = ["Mia", "Twinkle Toes", "Leo", "Captain Boo", "Ava", "Sofia", "Noah", "Zoe", "Max", "Eli", "Ruby", "Finn", "Owen", "Bartholomew The Brave"];
const PARTY_BUDDIES = [25, 700, 4, 94, 133, 906, 7, 152, 6, 255, 1, 393, 9, 150];

registerDemo("settings-party", () => {
  const now = Date.now();
  const entries: ScoreEntry[] = PARTY_NAMES.map((name, i) => {
    const survival = i % 5 === 4;
    const correct = 10 - (i % 8);
    return {
      id: `party-${i}`,
      name,
      buddy: PARTY_BUDDIES[i],
      mode: survival ? "survival" : "classic",
      points: correct * 240,
      correct,
      total: survival ? correct + 3 : 10,
      bestStreak: 3,
      difficulty: "easy",
      categoryId: "all",
      at: now - (i * 13 + 2) * 60_000,
    };
  });
  entries.push({ ...entries[0], id: "party-old", name: "Last Week", at: now - 7 * 24 * 3_600_000 });
  try {
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(entries));
  } catch {
    // storage blocked: the list just starts empty
  }
  openSettings("party");
});
