import { useEffect, useRef, type CSSProperties } from "react";
import { audio } from "../../../audio";
import { haptic } from "../../../lib/haptic";
import { IconButton, IconGear, toast } from "../../components";
import s from "./menus.module.css";

const DOUBLE_SHIFT_MS = 450;

function typingIn(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

/**
 * Settings gear with a kid lock: it opens only after a press-and-hold of `ms`, while a ring fills.
 * On a keyboard, hold "S" for the same time or tap Shift twice.
 */
export function HoldGear({ onOpen, ms = 1500 }: { onOpen: () => void; ms?: number }) {
  const wrap = useRef<HTMLSpanElement>(null);
  const hold = useRef({ start: 0, raf: 0, active: false, done: false, from: "" as "pointer" | "key" | "" });
  const openRef = useRef(onOpen);
  openRef.current = onOpen;

  const paint = (p: number) => wrap.current?.style.setProperty("--hold", p.toFixed(3));

  const stop = () => {
    const h = hold.current;
    cancelAnimationFrame(h.raf);
    h.active = false;
    h.from = "";
    if (wrap.current) delete wrap.current.dataset.holding;
    paint(0);
  };

  const finish = () => {
    stop();
    hold.current.done = true;
    audio.sfx("select");
    haptic("success");
    openRef.current();
  };

  const tick = () => {
    const h = hold.current;
    if (!h.active) return;
    const p = Math.min(1, (performance.now() - h.start) / ms);
    paint(p);
    if (p >= 1) finish();
    else h.raf = requestAnimationFrame(tick);
  };

  const begin = (from: "pointer" | "key") => {
    const h = hold.current;
    if (h.active) return;
    Object.assign(h, { start: performance.now(), active: true, done: false, from });
    if (wrap.current) wrap.current.dataset.holding = "on";
    audio.sfx("tap");
    haptic("tap");
    h.raf = requestAnimationFrame(tick);
  };

  useEffect(() => {
    let lastShift = 0;
    const down = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || typingIn(e.target)) return;
      if (e.key === "s" || e.key === "S") begin("key");
      else if (e.key === "Shift") {
        const now = performance.now();
        if (now - lastShift < DOUBLE_SHIFT_MS) {
          lastShift = 0;
          finish();
        } else lastShift = now;
      }
    };
    const up = (e: KeyboardEvent) => {
      if ((e.key === "s" || e.key === "S") && hold.current.from === "key") stop();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", stop);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", stop);
      cancelAnimationFrame(hold.current.raf);
    };
    // Mount once: begin, finish and stop only touch refs, so stale closures are fine.
  }, []);

  const release = () => {
    if (hold.current.from === "pointer") stop();
  };

  return (
    <span
      ref={wrap}
      className={s.gear}
      style={{ "--hold": 0 } as CSSProperties}
      onPointerDown={(e) => {
        if (e.pointerType !== "mouse" || e.button === 0) begin("pointer");
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
      onContextMenu={(e) => e.preventDefault()}
    >
      <IconButton
        icon={<IconGear />}
        label="Settings (press and hold)"
        sfx={null}
        onPress={() => {
          if (hold.current.done) return;
          toast("Grown-ups: press and hold the gear", { icon: <IconGear />, ms: 2000 });
        }}
      />
      <svg className={s.ring} viewBox="0 0 100 100" aria-hidden="true">
        <circle className={s.ringTrack} cx="50" cy="50" r="46" pathLength={100} />
        <circle className={s.ringFill} cx="50" cy="50" r="46" pathLength={100} />
      </svg>
    </span>
  );
}
