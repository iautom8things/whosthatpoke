import { motion } from "motion/react";
import { audio } from "../../../audio";
import type { CategoryGroup } from "../../../game/categories";
import { haptic } from "../../../lib/haptic";
import { cx } from "../../components";
import { NAV } from "./shared";
import s from "./Category.module.css";

export const GROUPS: readonly { id: CategoryGroup; label: string }[] = [
  { id: "featured", label: "Featured" },
  { id: "region", label: "Regions" },
  { id: "type", label: "Types" },
];

/** Segmented control for the category groups. The yellow thumb slides to the active tab. */
export function GroupTabs({ group, onChange, className }: { group: CategoryGroup; onChange: (g: CategoryGroup) => void; className?: string }) {
  return (
    <div className={cx(s.tabs, className)} role="tablist" aria-label="Theme groups">
      {GROUPS.map((g) => {
        const active = g.id === group;
        return (
          <button
            key={g.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={cx(NAV, s.tab)}
            onClick={() => {
              if (active) return;
              audio.sfx("select");
              haptic("select");
              onChange(g.id);
            }}
          >
            {active && <motion.span layoutId="wtp-cat-tab" className={s.thumb} transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
            <span className={s.tabLabel}>{g.label}</span>
          </button>
        );
      })}
    </div>
  );
}
