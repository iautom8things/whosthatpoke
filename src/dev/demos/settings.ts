// ?demo=settings opens the host panel (add &tab=look, &tab=offline, ... for another tab).
// ?demo=settings-prizes opens it on the prize editor.
import { useNav } from "../../state/nav";
import { setSettingsTab, SETTINGS_TABS, type SettingsTab } from "../../ui/screens/settings/tabs";
import { registerDemo } from "../demos";

function openSettings(fallback: SettingsTab): void {
  const asked = new URLSearchParams(location.search).get("tab") as SettingsTab | null;
  setSettingsTab(asked && SETTINGS_TABS.includes(asked) ? asked : fallback);
  useNav.setState({ screen: "settings", history: ["title"] });
}

registerDemo("settings", () => openSettings("sound"));
registerDemo("settings-prizes", () => openSettings("prizes"));
