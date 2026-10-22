import type { Mode } from "../../../game/deck";
import { IconPlay, IconUsers, Pill, PokeBall } from "../../components";

const LABEL: Record<Mode, string> = { classic: "Classic", survival: "Survival", host: "Host mode" };

/** Small reminder of the mode picked on the title screen. */
export function ModeBadge({ mode, className }: { mode: Mode; className?: string }) {
  const icon = mode === "survival" ? <PokeBall size="1.1em" /> : mode === "host" ? <IconUsers /> : <IconPlay />;
  return (
    <Pill className={className} icon={icon} size="md">
      {LABEL[mode]}
    </Pill>
  );
}
