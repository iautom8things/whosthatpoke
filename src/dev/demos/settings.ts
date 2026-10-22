// ?demo=settings opens the host panel (add &tab=look, &tab=offline, ... for another tab).
// ?demo=settings-prizes opens it on the prize editor.
// Offline cards, dev server only (a real service worker overrides them in a build):
//   &tab=offline&pwa=installing|reload|ready|error&art=<pictures saved>
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
  useNav.setState({ screen: "settings", history: ["title"] });
}

registerDemo("settings", () => openSettings("sound"));
registerDemo("settings-prizes", () => openSettings("prizes"));
