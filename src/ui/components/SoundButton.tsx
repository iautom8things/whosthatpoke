import { useRef, type ComponentType } from "react";
import { audio } from "../../audio";
import { nextSoundMode, useSettings, type SoundMode } from "../../state/settings";
import { cx } from "./cx";
import { IconButton } from "./IconButton";
import { IconMusic, IconVolume, IconVolumeOff, type IconProps } from "./icons";
import s from "./SoundButton.module.css";
import { toast, type ToastTone } from "./Toast";

/** Names, toasts and icons for the sound modes, shared with the Settings chips. */
export const SOUND_INFO: Record<SoundMode, { name: string; toast: string; tone: ToastTone; Icon: ComponentType<IconProps> }> = {
  full: { name: "All on", toast: "Sound on", tone: "good", Icon: IconVolume },
  noVoice: { name: "No voice", toast: "Announcer off", tone: "info", Icon: IconMusic },
  mute: { name: "Muted", toast: "All sound off", tone: "bad", Icon: IconVolumeOff },
};

/** App binds this key to cycleSound on every screen. */
export const SOUND_KEY = "m";

let dismissLast: (() => void) | null = null;

/** Moves to the next sound mode and names it in a toast. Fast taps replace the toast instead of stacking it. */
export function cycleSound(): void {
  const { sound, update } = useSettings.getState();
  const next = nextSoundMode(sound);
  update({ sound: next });
  // After the change, so the click sounds only when something still plays.
  audio.sfx("tap");
  dismissLast?.();
  const { toast: message, tone, Icon } = SOUND_INFO[next];
  dismissLast = toast(message, { tone, icon: <Icon />, ms: 1800 });
}

/** The top-right speaker (ScreenFrame's `sound`). A tap cycles all on, no voice and muted. */
export function SoundButton({ className }: { className?: string }) {
  const mode = useSettings((st) => st.sound);
  const { name, Icon } = SOUND_INFO[mode];
  // The icon pops on a change, not each time a screen slides in.
  const shown = useRef(mode);
  const changed = useRef(false);
  if (shown.current !== mode) {
    shown.current = mode;
    changed.current = true;
  }
  return (
    // Show-off mode leaves on any tap; this one must not. data-sound lets the game's reveal ignore it too.
    <span className={cx(s.wrap, className)} data-sound={mode} onClick={(e) => e.stopPropagation()}>
      <IconButton
        icon={
          <span key={mode} className={cx(s.icon, changed.current && s.swap)}>
            <Icon />
          </span>
        }
        label={`Sound: ${name}`}
        sfx={null}
        onPress={cycleSound}
      />
    </span>
  );
}
