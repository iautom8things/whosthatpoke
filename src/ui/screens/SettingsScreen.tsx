// Host panel: sound, game rules, look, prizes, party tools, offline status and credits.
// Reached by press-and-hold on the title screen. Back (or Escape) returns to the title.
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { audio } from "../../audio";
import { useKeys } from "../../lib/useKeys";
import { useSettings } from "../../state/settings";
import { IconEye, IconNext, IconPlay, IconStar, IconTrophy, IconVolume, Panel, ScreenFrame } from "../components";
import { IconInfo, IconSave } from "./settings/icons";
import { OfflineSection } from "./settings/OfflineSection";
import { PrizesSection } from "./settings/PrizesSection";
import { AboutSection, GameSection, LookSection, PartySection, SoundSection } from "./settings/sections";
import s from "./settings/Settings.module.css";
import { setSettingsTab, SETTINGS_TABS, useSettingsTab, type SettingsTab } from "./settings/tabs";

const TABS: Record<SettingsTab, { label: string; icon: ReactNode; Section: () => ReactNode }> = {
  sound: { label: "Sound", icon: <IconVolume />, Section: SoundSection },
  game: { label: "Game", icon: <IconPlay />, Section: GameSection },
  look: { label: "Look", icon: <IconEye />, Section: LookSection },
  prizes: { label: "Prizes", icon: <IconTrophy />, Section: PrizesSection },
  party: { label: "Party", icon: <IconStar />, Section: PartySection },
  offline: { label: "Offline", icon: <IconSave />, Section: OfflineSection },
  about: { label: "About", icon: <IconInfo />, Section: AboutSection },
};

const tabId = (t: SettingsTab) => `settings-tab-${t}`;

function TabRail({ current }: { current: SettingsTab }) {
  const refs = useRef<Partial<Record<SettingsTab, HTMLButtonElement | null>>>({});

  const select = (t: SettingsTab, focus = false) => {
    if (t !== current) {
      audio.sfx("select");
      setSettingsTab(t);
    }
    if (focus) refs.current[t]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = SETTINGS_TABS.indexOf(current);
    const delta = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    select(SETTINGS_TABS[(i + delta + SETTINGS_TABS.length) % SETTINGS_TABS.length], true);
  };

  return (
    <div className={s.rail} role="tablist" aria-label="Settings sections" onKeyDown={onKeyDown}>
      {SETTINGS_TABS.map((t) => (
        <button
          key={t}
          ref={(el) => {
            refs.current[t] = el;
          }}
          id={tabId(t)}
          type="button"
          role="tab"
          aria-selected={t === current}
          aria-controls="settings-panel"
          tabIndex={t === current ? 0 : -1}
          className={s.tab}
          onClick={() => select(t)}
        >
          <span className={s.tabIcon}>{TABS[t].icon}</span>
          <span className={s.tabLabel}>{TABS[t].label}</span>
        </button>
      ))}
    </div>
  );
}

/** Whether content hides above or below the scroller's edges. Follows scrolling and resizes. */
function useScrollEdges(ref: RefObject<HTMLElement | null>, key: unknown) {
  const [edges, setEdges] = useState({ above: false, below: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const above = el.scrollTop > 4;
      const below = el.scrollTop + el.clientHeight < el.scrollHeight - 4;
      setEdges((e) => (e.above === above && e.below === below ? e : { above, below }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    for (const child of el.children) ro.observe(child);
    el.addEventListener("scroll", measure, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", measure);
    };
  }, [ref, key]);
  return edges;
}

export default function SettingsScreen() {
  const tab = useSettingsTab((st) => st.tab);
  const theme = useSettings((st) => st.theme);
  const { Section } = TABS[tab];
  const scroller = useRef<HTMLElement>(null);
  const edges = useScrollEdges(scroller, tab);

  // Keep the menu music going (and follow a theme change) so volume changes are audible.
  useEffect(() => audio.playSong(theme === "spooky" ? "spooky" : "title"), [theme]);

  const step = (delta: number) => {
    const i = SETTINGS_TABS.indexOf(tab);
    const next = SETTINGS_TABS[i + delta];
    if (!next) return;
    audio.sfx("select");
    setSettingsTab(next);
  };
  useKeys({ PageDown: () => step(1), PageUp: () => step(-1) });

  return (
    <ScreenFrame back title="Host Panel" layout="fill" bodyClassName={s.body}>
      <div className={s.layout}>
        <TabRail current={tab} />
        <Panel tone="solid" padding="none" className={s.pane}>
          <section ref={scroller} key={tab} id="settings-panel" role="tabpanel" aria-labelledby={tabId(tab)} className={s.scroller}>
            <div>
              <Section />
            </div>
          </section>
          <div className={s.fade} data-edge="top" data-show={edges.above || undefined} aria-hidden="true" />
          <div className={s.fade} data-edge="bottom" data-show={edges.below || undefined} aria-hidden="true">
            <span className={s.fadeChevron}>
              <IconNext style={{ rotate: "90deg" }} />
            </span>
          </div>
        </Panel>
      </div>
    </ScreenFrame>
  );
}
