import { AnimatePresence, motion, type Variants } from "motion/react";
import { useMemo, useRef, useState, type CSSProperties } from "react";
import { audio } from "../../audio";
import { categoryById, CATEGORIES, type Category, type CategoryGroup } from "../../game/categories";
import { categoryInfo } from "../../game/deck";
import { isReducedMotion } from "../../lib/reducedMotion";
import { useViewport } from "../../lib/useViewport";
import { useNav } from "../../state/nav";
import { useSession } from "../../state/session";
import { useSettings } from "../../state/settings";
import { Card, cx, Display, ScreenFrame } from "../components";
import { GroupTabs, GROUPS } from "./menus/GroupTabs";
import { ModeBadge } from "./menus/ModeBadge";
import { findMon, MonImg, NAV, useMenuKeys, useMenuSong } from "./menus/shared";
import { useTapSafeSwipe } from "./menus/useTapSafeSwipe";
import s from "./menus/Category.module.css";

const PAGE: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: `${dir * 40}%` }),
  center: { opacity: 1, x: "0%", transition: { type: "spring", stiffness: 380, damping: 34 } },
  exit: (dir: number) => ({ opacity: 0, x: `${dir * -40}%`, transition: { duration: 0.16, ease: "easeIn" } }),
};

/** "Pick a theme": Featured, Regions and Types, as big tappable cards. Swipe or tap a tab to switch groups. */
export default function CategoryScreen() {
  const root = useRef<HTMLDivElement>(null);
  const mode = useSession((st) => st.setup.mode);
  const current = useSession((st) => st.setup.categoryId);
  const rounds = useSettings((st) => st.rounds);
  const vp = useViewport();
  const [group, setGroup] = useState<CategoryGroup>(() => categoryById(current).group);
  const [dir, setDir] = useState(1);
  const [picked, setPicked] = useState<string | null>(null);
  useMenuSong();

  const cards = useMemo(() => CATEGORIES.filter((c) => c.group === group), [group]);
  const info = useMemo(() => new Map(CATEGORIES.map((c) => [c.id, categoryInfo(c.id, rounds)])), [rounds]);

  const show = (next: CategoryGroup) => {
    const from = GROUPS.findIndex((g) => g.id === group);
    const to = GROUPS.findIndex((g) => g.id === next);
    if (from === to) return;
    setDir(to > from ? 1 : -1);
    setGroup(next);
  };
  const step = (by: -1 | 1) => {
    const next = GROUPS[GROUPS.findIndex((g) => g.id === group) + by];
    if (!next) return;
    audio.sfx("whoosh");
    show(next.id);
  };

  // Survival never runs out (it borrows from the whole catalog), so any non-empty theme works.
  const playable = (c: Category) => {
    const i = info.get(c.id);
    return !i || i.playable || (mode === "survival" && i.count > 0);
  };

  const pick = (c: Category) => {
    if (picked || !playable(c)) return;
    setPicked(c.id);
    useSession.getState().setSetup({ categoryId: c.id });
    window.setTimeout(() => useNav.getState().go("difficulty"), isReducedMotion() ? 0 : 170);
  };

  const swipe = useTapSafeSwipe({
    axis: "x",
    // A page flip needs less travel than a card throw: 160 px at most.
    distance: Math.max(70, Math.min(160, vp.w * 0.18)),
    onSwipe: (d) => {
      if (d === "left" || d === "right") step(d === "left" ? 1 : -1);
    },
  });

  const firstStop = () =>
    root.current?.querySelector<HTMLElement>(`.${s.card}[aria-pressed="true"]`) ?? root.current?.querySelector<HTMLElement>(`.${s.card}:not(:disabled)`);

  useMenuKeys(root, {
    initial: firstStop,
    // Enter with nothing focused picks the highlighted theme when it is on screen, else focuses the first card.
    onEnter: () => (categoryById(current).group === group ? pick(categoryById(current)) : firstStop()?.focus()),
    onPage: step,
  });

  const tabs = <GroupTabs group={group} onChange={show} />;

  return (
    <div ref={root} className={s.root}>
      <ScreenFrame
        layout="fill"
        back
        title={vp.short ? tabs : <Display size="xl" as="h1">Pick a theme!</Display>}
        headerRight={<ModeBadge mode={mode} className={s.badge} />}
        bodyClassName={cx(s.body, vp.short && s.bodyShort)}
      >
        {!vp.short && <div className={s.tabsRow}>{tabs}</div>}
        {/* pan-y: vertical drags scroll the Types grid on phones, sideways drags switch groups. */}
        <div className={s.area} {...swipe.bind} style={{ touchAction: "pan-y" }}>
          <AnimatePresence initial={false} custom={dir} mode="popLayout">
            <motion.div key={group} className={s.page} custom={dir} variants={PAGE} initial="enter" animate="center" exit="exit">
              <div
                className={s.grid}
                data-group={group}
                data-dragging={swipe.dragging || undefined}
                style={{ "--drag": `${swipe.dx * 0.35}px` } as CSSProperties}
                role="tabpanel"
              >
                {cards.map((c, i) => {
                  const count = info.get(c.id)?.count ?? 0;
                  const open = playable(c);
                  return (
                    <Card
                      key={c.id}
                      className={cx(NAV, s.card)}
                      accent={c.accent}
                      selected={c.id === (picked ?? current) || undefined}
                      disabled={!open}
                      onPress={() => pick(c)}
                      style={{ "--i": i } as CSSProperties}
                      aria-label={`${c.label}, ${open ? `${count} Pokémon` : "coming soon"}`}
                    >
                      <span className={s.art}>
                        <MonImg mon={findMon(c.mascot)} />
                      </span>
                      <span className={s.text}>
                        <span className={cx("wtp-display", s.label)}>{c.label}</span>
                        {c.group === "featured" && <span className={s.blurb}>{c.blurb}</span>}
                        <span className={s.count}>{open ? `${count} Pokémon` : "Coming soon"}</span>
                      </span>
                      {c.id === "spooky" && <span className={s.sticker}>Tonight!</span>}
                    </Card>
                  );
                })}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </ScreenFrame>
    </div>
  );
}
