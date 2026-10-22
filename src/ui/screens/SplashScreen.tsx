import { useRef, useState, type CSSProperties } from "react";
import { audio } from "../../audio";
import { haptic } from "../../lib/haptic";
import { isReducedMotion } from "../../lib/reducedMotion";
import { useKeys } from "../../lib/useKeys";
import { useNav } from "../../state/nav";
import { Burst, IconVolume, Logo, PokeBall, ScreenFrame } from "../components";
import { logoHandoff, useMenuSong } from "./menus/shared";
import s from "./menus/Splash.module.css";

/** First thing the crowd sees. One tap anywhere unlocks sound (iOS needs a gesture) and opens the menu. */
export default function SplashScreen() {
  const [opening, setOpening] = useState(false);
  const started = useRef(false);
  useMenuSong();

  const start = () => {
    if (started.current) return;
    started.current = true;
    // unlock() must start inside the gesture; the menu song queued above begins once it resolves.
    // Sounds wait for it too: WebKit drops any sfx asked for while the context is still resuming.
    void audio.unlock().then(() => {
      audio.sfx("select");
      window.setTimeout(() => audio.sfx("whoosh"), 120);
    });
    haptic("success");
    setOpening(true);
    window.setTimeout(() => {
      logoHandoff.fromSplash = true;
      useNav.getState().go("title", { replace: true });
    }, isReducedMotion() ? 60 : 520);
  };

  useKeys({ "Enter|Space|ArrowRight|PageDown": start });

  return (
    <div className={s.root} onClick={start} data-opening={opening || undefined}>
      <ScreenFrame layout="fill" bodyClassName={s.body}>
        <div className={s.logo}>
          <Logo size="xl" animated bob style={{ "--fs": "var(--logo-fs)" } as CSSProperties} />
        </div>
        <button type="button" className={s.tap} aria-label="Tap to play">
          <span className={s.ballZone} aria-hidden="true">
            <Burst intensity={0.9} rays={16} />
            <span className={s.pulse} />
            <span className={s.pulse} data-late />
            <span className={s.ball}>
              <PokeBall size="100%" animate={opening ? "none" : "wobble"} />
            </span>
            <span className={s.flash} />
          </span>
          <span className={`wtp-display ${s.cta}`}>Tap to play!</span>
        </button>
        <p className={s.hint}>
          <IconVolume /> Sound on for the full show
        </p>
      </ScreenFrame>
    </div>
  );
}
