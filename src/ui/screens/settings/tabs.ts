import { create } from "zustand";

export const SETTINGS_TABS = ["sound", "game", "look", "prizes", "party", "offline", "about"] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

/** The open Settings tab. Kept outside the screen so the host comes back to where they were. */
export const useSettingsTab = create<{ tab: SettingsTab }>(() => ({ tab: "sound" }));

export const setSettingsTab = (tab: SettingsTab) => useSettingsTab.setState({ tab });
