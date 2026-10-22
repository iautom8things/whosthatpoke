import type { Mode } from "../../../game/deck";
import { cx, IconUsers, PokeBall } from "../../components";
import s from "./menus.module.css";

const LABEL: Record<Mode, string> = { classic: "Classic", survival: "Survival", host: "Host mode" };

/** The mode's own mark: one ball for Classic, three lives for Survival, the crowd for Host. */
function ModeIcon({ mode }: { mode: Mode }) {
  if (mode === "host") return <IconUsers />;
  if (mode === "classic") return <PokeBall size="1.1em" />;
  return (
    <>
      <PokeBall size="0.85em" />
      <PokeBall size="0.85em" />
      <PokeBall size="0.85em" />
    </>
  );
}

/**
 * Small reminder of the mode picked on the title screen. Flat, so nobody takes it for a button.
 * Phones keep the icon and drop the word.
 */
export function ModeBadge({ mode, className }: { mode: Mode; className?: string }) {
  return (
    <span className={cx(s.modeTag, className)}>
      <span className={s.modeTagIcon} aria-hidden="true">
        <ModeIcon mode={mode} />
      </span>
      <span className={s.modeTagLabel}>{LABEL[mode]}</span>
    </span>
  );
}
