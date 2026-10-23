import { motion, type Variants } from "motion/react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Mode } from "../../game/deck";
import { useIdle } from "../../lib/useIdle";
import { useNav } from "../../state/nav";
import { useSession } from "../../state/session";
import { useSettings } from "../../state/settings";
import { Button, Card, cx, IconButton, IconPlay, IconTrophy, IconUsers, Lives, Logo, ScreenFrame } from "../components";
import { HoldGear } from "./menus/HoldGear";
import { Peeker } from "./menus/Peeker";
import { PlayAtHome } from "./menus/PlayAtHome";
import { logoHandoff, NAV, useMenuKeys, useMenuSong } from "./menus/shared";
import { TopTrainer } from "./menus/TopTrainer";
import s from "./menus/Title.module.css";

const ITEM: Variants = {
  hidden: { opacity: 0, y: 28, scale: 0.92 },
  shown: (i: number) => ({ opacity: 1, y: 0, scale: 1, transition: { delay: 0.25 + i * 0.08, type: "spring", stiffness: 420, damping: 24 } }),
};

const HOME_IN = { delay: 0.8, type: "spring", stiffness: 380, damping: 22 } as const;

/** Main menu: pick how to play. */
export default function TitleScreen() {
  const root = useRef<HTMLDivElement>(null);
  const rounds = useSettings((st) => st.rounds);
  const timer = useSettings((st) => st.timer);
  const attractAfterSec = useSettings((st) => st.attractAfterSec);
  const go = useNav((st) => st.go);
  // Straight from the splash the logo is already up, so it stays put instead of dropping in again.
  const [logoIntro] = useState(() => !logoHandoff.fromSplash);
  useEffect(() => {
    logoHandoff.fromSplash = false;
  }, []);
  useMenuSong();
  useIdle(attractAfterSec > 0 ? attractAfterSec * 1000 : null, () => go("showcase"));

  const play = (mode: Mode) => {
    useSession.getState().setSetup({ mode });
    go("category");
  };

  useMenuKeys(root, {
    onEnter: () => play("classic"),
    initial: () => root.current?.querySelector<HTMLElement>(`.${s.play}`),
  });

  return (
    <div ref={root} className={s.root}>
      <Peeker />
      <ScreenFrame
        layout="fill"
        bodyClassName={s.body}
        headerLeft={<IconButton className={NAV} icon={<IconTrophy />} label="Top trainers" showLabel variant="ghost" onPress={() => go("leaderboard")} />}
        headerRight={<HoldGear onOpen={() => go("settings")} />}
      >
        <div className={s.hero}>
          <Logo size="xl" animated={logoIntro} bob style={{ "--fs": "var(--logo-fs)" } as CSSProperties} />
          <div className={s.heroRow}>
            <TopTrainer />
            <motion.div className={s.home} initial={{ opacity: 0, y: 16, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={HOME_IN}>
              <PlayAtHome />
            </motion.div>
          </div>
        </div>

        <nav className={s.menu} aria-label="Game modes">
          <motion.div variants={ITEM} custom={0} initial="hidden" animate="shown" className={s.playWrap}>
            <Button size="xl" block icon={<IconPlay />} className={cx(NAV, s.play)} onPress={() => play("classic")} aria-describedby="wtp-play-sub">
              Play!
            </Button>
            <span id="wtp-play-sub" className={s.playSub}>
              {rounds} Pokémon. {timer ? "Beat the clock!" : "Take your time!"}
            </span>
          </motion.div>

          <div className={s.modes}>
            <motion.div variants={ITEM} custom={1} initial="hidden" animate="shown">
              <Card
                className={cx(NAV, s.mode)}
                accent="var(--pokeball-red)"
                onPress={() => play("survival")}
                aria-label="Survival: how many in a row? You get 3 lives."
              >
                <span className={s.modeIcon}>
                  <Lives total={3} remaining={3} className={s.lives} />
                </span>
                <span className={cx("wtp-display", s.modeName)}>Survival</span>
                <span className={s.modeBlurb}>How many in a row? 3 lives!</span>
              </Card>
            </motion.div>
            <motion.div variants={ITEM} custom={2} initial="hidden" animate="shown">
              <Card
                className={cx(NAV, s.mode)}
                accent="var(--good)"
                onPress={() => play("host")}
                aria-label="Host mode: kids shout the answer, a grown-up swipes."
              >
                <span className={cx(s.modeIcon, s.hostIcon)}>
                  <IconUsers />
                </span>
                <span className={cx("wtp-display", s.modeName)}>Host mode</span>
                <span className={s.modeBlurb}>Kids shout it, a grown-up swipes!</span>
              </Card>
            </motion.div>
          </div>
        </nav>
      </ScreenFrame>
    </div>
  );
}
