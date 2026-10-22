// Offline: is everything saved on this device, and how to install it on the iPad's Home Screen.
import { useEffect, type CSSProperties, type ReactNode } from "react";
import { CATALOG } from "../../../data/catalog";
import { useInterval } from "../../../lib/useInterval";
import { applyUpdate, refreshOfflineStats, usePwa } from "../../../pwa";
import { Button, IconCheck, IconRefresh, IconX } from "../../components";
import { Row, SectionTitle } from "./controls";
import { IconPlusBox, IconSave, IconShare } from "./icons";
import s from "./Settings.module.css";

const TOTAL_ART = new Set(CATALOG.map((m) => m.art)).size;

function isInstalled(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || matchMedia("(display-mode: standalone), (display-mode: fullscreen)").matches;
}

const mb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1_000_000))} MB`;

function StatusCard({ tone, icon, title, children }: { tone: "good" | "busy" | "warn"; icon: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <div className={s.status} data-tone={tone} role="status">
      <span className={s.statusIcon} aria-hidden="true">
        {icon}
      </span>
      <div className={s.statusText}>
        <div className={s.statusTitle}>{title}</div>
        {children}
      </div>
    </div>
  );
}

function OfflineStatus() {
  const { status, cachedArt, usage } = usePwa();
  const saved = cachedArt ?? 0;
  const counted = cachedArt !== null ? `${Math.min(saved, TOTAL_ART)} of ${TOTAL_ART} Pokémon pictures saved` : "Counting Pokémon pictures…";

  switch (status) {
    case "ready":
      return (
        <StatusCard tone="good" icon={<IconCheck />} title="Ready to work offline!">
          <div className={s.statusHint}>
            {counted}
            {usage ? ` (${mb(usage)})` : ""}. No Wi-Fi needed at the party.
          </div>
        </StatusCard>
      );
    case "installing":
      return (
        <StatusCard tone="busy" icon={<IconSave />} title="Saving for offline…">
          <div className={s.statusHint}>{counted}. Keep this page open on Wi-Fi for a minute.</div>
          <div className={s.progress} style={{ "--p": `${(100 * Math.min(saved, TOTAL_ART)) / Math.max(1, TOTAL_ART)}%` } as CSSProperties}>
            <span />
          </div>
        </StatusCard>
      );
    case "dev":
      return (
        <StatusCard tone="warn" icon={<IconX />} title="Offline is off in dev mode">
          <div className={s.statusHint}>The built app (npm run build) saves everything. The dev server skips it.</div>
        </StatusCard>
      );
    case "unsupported":
      return (
        <StatusCard tone="warn" icon={<IconX />} title="Can’t save offline here">
          <div className={s.statusHint}>Open the game from its https:// link (not a local IP address) to save it.</div>
        </StatusCard>
      );
    default:
      return (
        <StatusCard tone="warn" icon={<IconX />} title="Offline saving failed">
          <div className={s.statusHint}>Reload the page on Wi-Fi to try again.</div>
        </StatusCard>
      );
  }
}

const STEPS: { icon: ReactNode; text: ReactNode }[] = [
  { icon: <IconShare />, text: <>In Safari, tap <b>Share</b></> },
  { icon: <IconPlusBox />, text: <>Tap <b>Add to Home Screen</b></> },
  { icon: <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" className={s.stepAppIcon} />, text: <>Open <b>Who’s That?</b> from the Home Screen</> },
];

export function OfflineSection() {
  const status = usePwa((st) => st.status);
  const needRefresh = usePwa((st) => st.needRefresh);
  const installed = isInstalled();

  useEffect(() => void refreshOfflineStats(), []);
  useInterval(() => void refreshOfflineStats(), status === "installing" ? 1000 : null);

  return (
    <>
      <SectionTitle>Offline</SectionTitle>
      <OfflineStatus />
      {needRefresh && (
        <Row label="New version ready" hint="Updating reloads the game. Do it between players.">
          <Button variant="success" icon={<IconRefresh />} onPress={applyUpdate}>
            Update
          </Button>
        </Row>
      )}
      {installed ? (
        <Row label="Running as an app" hint="Full screen, no browser bars. You’re all set." />
      ) : (
        <div className={s.install}>
          <div className={s.installHead}>
            <div className={s.rowLabel}>Put it on the iPad</div>
            <div className={s.rowHint}>Full screen with no browser bars, and it opens with no Wi-Fi.</div>
          </div>
          <ol className={s.steps}>
            {STEPS.map((step, i) => (
              <li key={i} className={s.step}>
                <span className={s.stepNum}>{i + 1}</span>
                <span className={s.stepIcon} aria-hidden="true">
                  {step.icon}
                </span>
                <span className={s.stepText}>{step.text}</span>
              </li>
            ))}
          </ol>
          <p className={s.rowHint}>Open it once on home Wi-Fi before the party so every picture is saved.</p>
        </div>
      )}
    </>
  );
}
