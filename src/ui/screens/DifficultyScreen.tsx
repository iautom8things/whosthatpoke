import { motion } from "motion/react";
import { useMemo, useRef, useState, type CSSProperties } from "react";
import { categoryById } from "../../game/categories";
import { categoryInfo, DIFFICULTY_PREVIEW } from "../../game/deck";
import { DIFFICULTIES, type Difficulty } from "../../game/difficulty";
import { isReducedMotion } from "../../lib/reducedMotion";
import { useKeys } from "../../lib/useKeys";
import { useViewport } from "../../lib/useViewport";
import { useNav } from "../../state/nav";
import { useSession } from "../../state/session";
import { useSettings } from "../../state/settings";
import { Card, cx, Display, PokeArt, PokeBall, ScreenFrame } from "../components";
import { findMon, MonImg, NAV, useMenuKeys, useMenuSong } from "./menus/shared";
import s from "./menus/Difficulty.module.css";

/** Card accents, matched to each ball's top half. */
const ACCENT: Record<Difficulty["ball"], string> = { poke: "#ee1515", great: "#2a6fdb", ultra: "#f2c200", master: "#9b45d6" };

/** Short kid-sized names for how hard each ball is. */
const LEVEL: Record<Difficulty["ball"], string> = { poke: "Easy", great: "Medium", ultra: "Hard", master: "Expert" };

/** The chosen theme as a badge: mascot art, name and size. */
function ThemeBadge({ categoryId, className }: { categoryId: string; className?: string }) {
  const c = categoryById(categoryId);
  const count = useMemo(() => categoryInfo(c.id).count, [c.id]);
  return (
    <div className={cx(s.theme, className)} style={{ "--accent": c.accent } as CSSProperties}>
      <span className={s.themeArt}>
        <MonImg mon={findMon(c.mascot)} />
      </span>
      <span className={s.themeText}>
        <span className={s.themeName}>{c.label}</span>
        <span className={s.themeCount}>{count} Pokémon</span>
      </span>
    </div>
  );
}

/** Pick a ball: Poké Ball (easy) to Master Ball (expert), each with a peek at the silhouettes it asks. */
export default function DifficultyScreen() {
  const root = useRef<HTMLDivElement>(null);
  const setup = useSession((st) => st.setup);
  const timer = useSettings((st) => st.timer);
  const vp = useViewport();
  const [picked, setPicked] = useState<string | null>(null);
  useMenuSong();

  const previews = useMemo(
    () => new Map(DIFFICULTIES.map((d) => [d.id, DIFFICULTY_PREVIEW(setup.categoryId, d.id, 3)])),
    [setup.categoryId],
  );

  const pick = (d: Difficulty) => {
    if (picked) return;
    setPicked(d.id);
    useSession.getState().setSetup({ difficulty: d.id });
    useSession.getState().start();
    const next = useSession.getState().setup.mode === "host" ? "host" : "game";
    window.setTimeout(() => useNav.getState().go(next), isReducedMotion() ? 0 : 220);
  };

  // Keyboard starts on the ball picked last time.
  const lastPick = () => root.current?.querySelector(`[data-level="${setup.difficulty}"]`)?.closest<HTMLElement>("button");
  useMenuKeys(root, { initial: lastPick, onEnter: () => lastPick()?.focus() });
  useKeys({
    "1|2|3|4": (e) => {
      const d = DIFFICULTIES[Number(e.key) - 1];
      if (d) pick(d);
    },
  });

  const showTimer = timer && setup.mode !== "host";
  const badgeInHeader = vp.orientation === "landscape";

  return (
    <div ref={root} className={s.root}>
      <ScreenFrame
        layout="fill"
        back
        title={<Display size="xl" as="h1">Pick a ball!</Display>}
        headerRight={badgeInHeader ? <ThemeBadge categoryId={setup.categoryId} /> : undefined}
        bodyClassName={cx(s.body, !badgeInHeader && s.bodyWithBadge)}
      >
        {!badgeInHeader && (
          <div className={s.badgeRow}>
            <ThemeBadge categoryId={setup.categoryId} />
          </div>
        )}
        <div className={s.grid}>
          {DIFFICULTIES.map((d, i) => {
            const chosen = picked === d.id;
            return (
              <motion.div
                key={d.id}
                className={s.cell}
                initial={{ opacity: 0, y: 30, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 0.06 + i * 0.07, type: "spring", stiffness: 420, damping: 26 }}
              >
                <Card
                  className={cx(NAV, s.card)}
                  accent={ACCENT[d.ball]}
                  selected={chosen || undefined}
                  onPress={() => pick(d)}
                  aria-label={`${d.label}, ${LEVEL[d.ball]}. ${d.blurb}${showTimer ? ` ${d.seconds} seconds per Pokémon.` : ""}`}
                >
                  <span className={s.ball} data-level={d.id}>
                    <PokeBall kind={d.ball} size="100%" animate={chosen ? "wobble" : "none"} />
                  </span>
                  <span className={s.head}>
                    <span className={cx("wtp-display", s.name)}>{d.label}</span>
                    <span className={s.meta}>
                      <span className={s.level}>{LEVEL[d.ball]}</span>
                      {showTimer && <span className={s.secs}>{d.seconds}s</span>}
                      {d.multiplier > 1 && <span className={s.mult}>×{d.multiplier} pts</span>}
                    </span>
                  </span>
                  <span className={s.blurb}>{d.blurb}</span>
                  <span className={s.sils} aria-hidden="true">
                    {previews.get(d.id)?.map((m) => (
                      <span key={m.dex} className={s.sil}>
                        <PokeArt mon={m} revealed={false} fill={0.92} />
                      </span>
                    ))}
                  </span>
                  <span className={s.key} aria-hidden="true">
                    {i + 1}
                  </span>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </ScreenFrame>
    </div>
  );
}
