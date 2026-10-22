// Offline: how much of the game is saved on this device, Save for offline, and how to install it on the iPad's
// Home Screen.
import { useEffect, type CSSProperties, type ReactNode } from "react";
import { allSaved, applyUpdate, ART_TOTAL, isInstalled, refreshOfflineStats, saveForOffline, stopSaving, usePwa, type PwaState } from "../../../pwa";
import { Button, IconCheck, IconRefresh, IconX, toast } from "../../components";
import { Row, SectionTitle } from "./controls";
import { IconPlusBox, IconSave, IconShare } from "./icons";
import s from "./Settings.module.css";

const mb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1_000_000))} MB`;

function StatusCard({ tone, icon, title, children, action }: { tone: "good" | "busy" | "warn"; icon: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={s.status} data-tone={tone} role="status">
      <span className={s.statusIcon} aria-hidden="true">
        {icon}
      </span>
      <div className={s.statusText}>
        <div className={s.statusTitle}>{title}</div>
        {children}
        {action && <div className={s.statusAction}>{action}</div>}
      </div>
    </div>
  );
}

/** Runs `then` only with a network: these buttons download the game. */
const online = (then: () => void) => () => {
  if (navigator.onLine === false) toast("Connect to Wi-Fi first.", { tone: "bad" });
  else then();
};

/** "312 of 1025 pictures and 40 of 5340 voice clips saved". */
function counted({ art, voice, voiceTotal }: Pick<PwaState, "art" | "voice" | "voiceTotal">): string {
  if (art === null) return "Counting saved pictures…";
  const pictures = `${Math.min(art, ART_TOTAL)} of ${ART_TOTAL} Pokémon pictures`;
  if (!voiceTotal) return `${pictures} saved`;
  return `${pictures} and ${Math.min(voice ?? 0, voiceTotal)} of ${voiceTotal} voice clips saved`;
}

function Bar({ label, have, total }: { label: string; have: number; total: number }) {
  const n = Math.min(have, total);
  return (
    <div className={s.saveBar}>
      <div className={s.saveBarLabel}>
        <span>{label}</span>
        <span>
          {n} / {total}
        </span>
      </div>
      <div className={s.progress} style={{ "--p": `${(100 * n) / Math.max(1, total)}%` } as CSSProperties}>
        <span />
      </div>
    </div>
  );
}

const saveButton = (label: string) => (
  <Button variant="success" icon={<IconSave />} onPress={online(() => saveForOffline())}>
    {label}
  </Button>
);

function OfflineStatus() {
  const pwa = usePwa();
  const { status, art, voice, voiceTotal, saving, saveFailed, savedOnce, usage } = pwa;

  // Before the status: a save keeps running (and showing) whatever the worker does meanwhile.
  if (saving)
    return (
      <StatusCard
        tone="busy"
        icon={<IconSave />}
        title="Saving for offline…"
        action={
          <Button variant="secondary" icon={<IconX />} onPress={stopSaving}>
            Stop
          </Button>
        }
      >
        <div className={s.statusHint}>Keep the game open on Wi-Fi until it’s done. Other tabs are fine.</div>
        <Bar label="Pictures" have={art ?? 0} total={ART_TOTAL} />
        {!!voiceTotal && <Bar label="Voice" have={voice ?? 0} total={voiceTotal} />}
      </StatusCard>
    );

  switch (status) {
    case "ready":
      if (art === null)
        return (
          <StatusCard tone="busy" icon={<IconSave />} title="Checking saved files…">
            <div className={s.statusHint}>{counted(pwa)}</div>
          </StatusCard>
        );
      if (allSaved(pwa))
        return (
          <StatusCard tone="good" icon={<IconCheck />} title="Ready to work offline!">
            <div className={s.statusHint}>
              {counted(pwa)}
              {usage ? ` (${mb(usage)})` : ""}. No Wi-Fi needed at the party.
            </div>
          </StatusCard>
        );
      if (saveFailed)
        return (
          <StatusCard tone="warn" icon={<IconX />} title={saveFailed === "full" ? "Not enough space" : "Saving stopped partway"} action={saveButton("Try again")}>
            <div className={s.statusHint}>
              {counted(pwa)}. {saveFailed === "full" ? "Free some space on the device, then try again." : "Check the Wi-Fi and try again. It picks up where it stopped."}
            </div>
          </StatusCard>
        );
      // Everything was saved once, so the browser cleared some of it. Saving again brings it back.
      if (savedOnce)
        return (
          <StatusCard tone="warn" icon={<IconX />} title={art < ART_TOTAL ? "Some pictures aren’t saved" : "Some voice clips aren’t saved"} action={saveButton("Save again")}>
            <div className={s.statusHint}>
              {counted(pwa)}. {art < ART_TOTAL ? "Missing ones show as “?” with no Wi-Fi." : "With no Wi-Fi, missing lines play in the device’s own voice, or not at all."} Save again while on Wi-Fi.
            </div>
          </StatusCard>
        );
      return (
        <StatusCard tone="busy" icon={<IconSave />} title="Not saved for offline yet" action={saveButton("Save for offline")}>
          <div className={s.statusHint}>
            {counted(pwa)}. Phones only download what they play, so a guest’s phone stays light. Save everything here on Wi-Fi before the party.
          </div>
        </StatusCard>
      );
    case "reload":
      return (
        <StatusCard
          tone="busy"
          icon={<IconSave />}
          title="Almost ready: reload once"
          action={
            <Button variant="success" icon={<IconRefresh />} onPress={() => location.reload()}>
              Reload
            </Button>
          }
        >
          <div className={s.statusHint}>The game is saved, but this page opened before that. Reload so it uses the saved copy with no Wi-Fi.</div>
        </StatusCard>
      );
    case "installing":
      return (
        <StatusCard tone="busy" icon={<IconSave />} title="Setting up offline…">
          <div className={s.statusHint}>Saving the game itself. It takes a few seconds on Wi-Fi.</div>
        </StatusCard>
      );
    case "dev":
      return (
        <StatusCard tone="warn" icon={<IconX />} title="Offline is off in dev mode">
          <div className={s.statusHint}>The built app (npm run build) saves for offline. The dev server skips it.</div>
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
        <StatusCard
          tone="warn"
          icon={<IconX />}
          title="Offline saving failed"
          action={
            <Button variant="success" icon={<IconRefresh />} onPress={online(() => location.reload())}>
              Try again
            </Button>
          }
        >
          <div className={s.statusHint}>The download stopped partway. Try again on Wi-Fi.</div>
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
  const needRefresh = usePwa((st) => st.needRefresh);
  const installed = isInstalled();

  useEffect(() => void refreshOfflineStats(), []);

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
        <Row label="Running as an app" hint="Full screen, no browser bars, and it saves everything for offline by itself." />
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
          <p className={s.rowHint}>Open it once on home Wi-Fi before the party. The Home Screen app saves every picture and voice clip by itself.</p>
        </div>
      )}
    </>
  );
}
