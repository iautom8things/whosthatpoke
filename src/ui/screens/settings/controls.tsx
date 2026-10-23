// Host-panel controls: setting rows, big switches, chip choices, a drag-or-tap level slider
// and a number stepper. All 64 px or taller, all keyboard reachable.
import { useId, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { audio, type SfxId } from "../../../audio";
import { haptic } from "../../../lib/haptic";
import { Chip, Display, IconButton, IconVolume, IconVolumeOff, cx } from "../../components";
import { IconMinus, IconPlus } from "./icons";
import s from "./Settings.module.css";

export function SectionTitle({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <header className={s.sectionHead}>
      <Display as="h2" size="xl" className={cx(s.sectionTitle, "wtp-surface-title")}>
        {children}
      </Display>
      {note && <p className={s.sectionNote}>{note}</p>}
    </header>
  );
}

export interface RowProps {
  label: ReactNode;
  hint?: ReactNode;
  /** Id of the control, so tapping the label works the control too. */
  htmlFor?: string;
  children?: ReactNode;
  /** Put the control under the text at every width (wide controls). */
  stack?: boolean;
  className?: string;
}

/** One setting: label and hint on the left, control on the right (wraps below when narrow). */
export function Row({ label, hint, htmlFor, children, stack, className }: RowProps) {
  const Label = htmlFor ? "label" : "div";
  return (
    <div className={cx(s.row, className)} data-stack={stack || undefined}>
      <div className={s.rowText}>
        <Label className={s.rowLabel} {...(htmlFor && { htmlFor })}>
          {label}
        </Label>
        {hint && <div className={s.rowHint}>{hint}</div>}
      </div>
      {children && <div className={s.rowControl}>{children}</div>}
    </div>
  );
}

export interface SwitchProps {
  id?: string;
  on: boolean;
  onChange(on: boolean): void;
  disabled?: boolean;
  /** Accessible name when no <label htmlFor> points here. */
  label?: string;
}

/** Big ON/OFF switch. The word is printed on the track so it never relies on color alone. */
export function Switch({ id, on, onChange, disabled, label }: SwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      className={s.switch}
      onClick={() => {
        audio.sfx(on ? "back" : "select");
        haptic("select");
        onChange(!on);
      }}
    >
      <span className={s.switchWord} aria-hidden="true">
        {on ? "On" : "Off"}
      </span>
      <span className={s.knob} aria-hidden="true" />
    </button>
  );
}

/** A row with a switch; the whole label is tappable. */
export function SwitchRow({ label, hint, on, onChange, disabled }: Omit<RowProps, "htmlFor" | "children"> & SwitchProps) {
  const id = useId();
  return (
    <Row label={label} hint={hint} htmlFor={id}>
      <Switch id={id} on={on} onChange={onChange} disabled={disabled} />
    </Row>
  );
}

export interface ChoicesProps<T> {
  value: T;
  options: readonly { value: T; label: ReactNode; icon?: ReactNode }[];
  onChange(value: T): void;
  label: string;
}

/** One-of-many as a row of chips. */
export function Choices<T extends string | number>({ value, options, onChange, label }: ChoicesProps<T>) {
  return (
    <div role="group" aria-label={label} className={s.choices}>
      {options.map((o) => (
        <Chip key={String(o.value)} selected={o.value === value} icon={o.icon} onPress={() => o.value !== value && onChange(o.value)} className={s.choice}>
          {o.label}
        </Chip>
      ))}
    </div>
  );
}

/**
 * Step (0..steps) under the pointer, for controls you can tap or drag across.
 * Returns pointer handlers that capture the pointer so a drag keeps working off the element.
 */
export function useStepDrag(steps: number, onStep: (step: number) => void, mode: "bars" | "cells" = "bars") {
  const last = useRef<number | null>(null);
  const at = (e: PointerEvent<HTMLElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    // bars: steps bars, the far-left sliver means 0. cells: steps + 1 equal cells, 0..steps.
    const step = mode === "bars" ? Math.ceil(t * steps - 0.15) : Math.floor(t * (steps + 1));
    return Math.min(steps, Math.max(0, step));
  };
  const fire = (step: number) => {
    if (step === last.current) return;
    last.current = step;
    onStep(step);
  };
  return {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      last.current = null;
      fire(at(e));
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) fire(at(e));
    },
    onPointerUp(e: PointerEvent<HTMLElement>) {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
      last.current = null;
    },
    onPointerCancel() {
      last.current = null;
    },
  };
}

/** Arrow/Home/End handling for a custom role="slider". */
export function sliderKeys(value: number, max: number, set: (v: number) => void) {
  return (e: KeyboardEvent<HTMLElement>) => {
    const next =
      e.key === "ArrowLeft" || e.key === "ArrowDown"
        ? value - 1
        : e.key === "ArrowRight" || e.key === "ArrowUp"
          ? value + 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? max
              : null;
    if (next == null) return;
    e.preventDefault();
    e.stopPropagation();
    const clamped = Math.min(max, Math.max(0, next));
    if (clamped !== value) set(clamped);
  };
}

export interface LevelProps {
  /** 0..1 */
  value: number;
  onChange(value: number): void;
  label: string;
  /** Played at the new level so the host hears it. */
  sfx?: SfxId | null;
  steps?: number;
}

/** Volume as five growing bars plus a mute button. Tap a bar or drag across them. */
export function Level({ value, onChange, label, sfx = "select", steps = 5 }: LevelProps) {
  const level = Math.round(value * steps);
  const restore = useRef(level > 0 ? value : 0.6);
  if (level > 0) restore.current = value;
  const set = (step: number) => {
    onChange(step / steps);
    haptic("select");
    // Settings apply to the audio engine synchronously, so the sample plays at the new level.
    if (sfx && step > 0) audio.sfx(sfx);
  };
  const drag = useStepDrag(steps, set);
  return (
    <div className={s.level}>
      <IconButton
        icon={level === 0 ? <IconVolumeOff /> : <IconVolume />}
        label={level === 0 ? `Unmute ${label}` : `Mute ${label}`}
        sfx={null}
        onPress={() => set(level === 0 ? Math.max(1, Math.round(restore.current * steps)) : 0)}
        className={s.levelMute}
      />
      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={steps}
        aria-valuenow={level}
        aria-valuetext={level === 0 ? "Off" : `${level} of ${steps}`}
        className={s.levelTrack}
        onKeyDown={sliderKeys(level, steps, set)}
        {...drag}
      >
        {Array.from({ length: steps }, (_, i) => (
          <span key={i} className={s.levelBar} data-on={i < level || undefined} style={{ "--h": `${28 + (72 * (i + 1)) / steps}%` } as CSSProperties} />
        ))}
      </div>
    </div>
  );
}

export interface StepperProps {
  value: number;
  min: number;
  max: number;
  onChange(value: number): void;
  label: string;
  /** What shows between the buttons. Default the number. */
  display?: ReactNode;
}

/** [-] value [+] */
export function Stepper({ value, min, max, onChange, label, display }: StepperProps) {
  return (
    <div className={s.stepper} role="group" aria-label={label}>
      <IconButton icon={<IconMinus />} label={`Less: ${label}`} disabled={value <= min} onPress={() => onChange(Math.max(min, value - 1))} />
      <output className={s.stepperValue} aria-live="polite">
        {display ?? value}
      </output>
      <IconButton icon={<IconPlus />} label={`More: ${label}`} disabled={value >= max} onPress={() => onChange(Math.min(max, value + 1))} />
    </div>
  );
}
