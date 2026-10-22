// Small pieces the four menu screens share: menu music, safe Pokémon lookup, color art,
// and keyboard focus that moves between tiles with the arrow keys.
import { useEffect, type RefObject } from "react";
import { audio } from "../../../audio";
import { artUrl, CATALOG } from "../../../data/catalog";
import type { Mon } from "../../../data/types";
import { useKeys } from "../../../lib/useKeys";
import { useSettings } from "../../../state/settings";
import { cx } from "../../components";

/** Menus play the Halloween theme in the spooky look, the adventure theme otherwise. */
export function useMenuSong(): void {
  const theme = useSettings((s) => s.theme);
  useEffect(() => {
    audio.playSong(theme === "spooky" ? "spooky" : "title");
  }, [theme]);
}

/** Set while the splash hands off to the title, so the title shows the logo it just saw instead of rebuilding it. */
export const logoHandoff = { fromSplash: false };

const BY_DEX = new Map(CATALOG.map((m) => [m.dex, m]));

/** Like monByDex, but a missing species (catalog still growing) is undefined instead of a throw. */
export function findMon(dex: number): Mon | undefined {
  return BY_DEX.get(dex);
}

/** Full-color art for tiles and badges. Decorative: the tile's label names it. */
export function MonImg({ mon, className }: { mon: Mon | undefined; className?: string }) {
  if (!mon) return <span className={className} aria-hidden="true" />;
  return <img className={cx("wtp-mon-img", className)} src={artUrl(mon)} alt="" draggable={false} decoding="async" />;
}

/** Class that marks a pressable as a stop for arrow-key focus. */
export const NAV = "wtp-nav";

type Dir = "up" | "down" | "left" | "right";

function stops(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(`.${NAV}`)].filter(
    (el) => !(el as HTMLButtonElement).disabled && el.getClientRects().length > 0,
  );
}

/** The closest stop in a direction, preferring ones in line with the current one. */
function nearest(from: HTMLElement, list: HTMLElement[], dir: Dir): HTMLElement | null {
  const a = from.getBoundingClientRect();
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  const horizontal = dir === "left" || dir === "right";
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of list) {
    if (el === from) continue;
    const b = el.getBoundingClientRect();
    const dx = b.left + b.width / 2 - ax;
    const dy = b.top + b.height / 2 - ay;
    const along = dir === "left" ? -dx : dir === "right" ? dx : dir === "up" ? -dy : dy;
    const across = horizontal ? Math.abs(dy) : Math.abs(dx);
    // Same row (or column) neighbors only count when they sit clearly past this one.
    if (along < (horizontal ? a.width : a.height) * 0.4) continue;
    const score = along + across * 2.5;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best;
}

function focus(el: HTMLElement) {
  el.focus();
  el.scrollIntoView({ block: "nearest", inline: "nearest" });
}

export interface MenuKeysOptions {
  /** Stop focused on the first arrow press when nothing is focused yet. Default: the first stop. */
  initial?: () => HTMLElement | null | undefined;
  /** Enter or Space with no stop focused. */
  onEnter?: () => void;
  /** PageUp/PageDown. Default: previous/next stop, like Left/Right for presentation clickers. */
  onPage?: (step: -1 | 1) => void;
  enabled?: boolean;
}

/**
 * Arrow keys move focus between `.wtp-nav` stops inside `root` by screen position, so it works
 * for any grid. Left/Right fall back to the previous/next stop at a row's end, so a two-button
 * presentation clicker can still reach everything. Enter/Space press the focused stop.
 */
export function useMenuKeys(root: RefObject<HTMLElement | null>, { initial, onEnter, onPage, enabled = true }: MenuKeysOptions = {}): void {
  const move = (dir: Dir | -1 | 1) => {
    const el = root.current;
    if (!el) return;
    const list = stops(el);
    if (list.length === 0) return;
    const active = document.activeElement as HTMLElement | null;
    const at = active ? list.indexOf(active) : -1;
    if (at < 0) {
      focus(initial?.() ?? list[0]);
      return;
    }
    if (typeof dir === "number") {
      const next = list[at + dir];
      if (next) focus(next);
      return;
    }
    const target = nearest(list[at], list, dir) ?? (dir === "right" ? list[at + 1] : dir === "left" ? list[at - 1] : undefined);
    if (target) focus(target);
  };

  useKeys(
    {
      ArrowUp: () => move("up"),
      ArrowDown: () => move("down"),
      ArrowLeft: () => move("left"),
      ArrowRight: () => move("right"),
      PageUp: () => (onPage ? onPage(-1) : move(-1)),
      PageDown: () => (onPage ? onPage(1) : move(1)),
      "Enter|Space": () => {
        const active = document.activeElement as HTMLElement | null;
        if (active && root.current?.contains(active) && active.matches("button")) active.click();
        else onEnter?.();
      },
    },
    { enabled },
  );
}
