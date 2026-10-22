import { useMemo, useState } from "react";
import type { Mon } from "../../../data/types";
import { categoryPool } from "../../../game/categories";
import { cx, PokeArt, preloadArt } from "../../components";
import s from "./menus.module.css";

const FAMOUS = 40;

function randomOther(pool: readonly Mon[], not?: Mon): Mon {
  if (pool.length < 2) return pool[0];
  let m = pool[Math.floor(Math.random() * pool.length)];
  while (m === not) m = pool[Math.floor(Math.random() * pool.length)];
  return m;
}

/**
 * A mystery silhouette that peeks up from the bottom edge, ducks back down and returns as a
 * different famous Pokémon. Decorative; it sits behind the menu and ignores pointers.
 * Under reduced motion it stays hidden.
 */
export function Peeker({ className }: { className?: string }) {
  const pool = useMemo(() => categoryPool("all").slice(0, FAMOUS), []);
  const [pair, setPair] = useState(() => {
    const now = randomOther(pool);
    const next = randomOther(pool, now);
    void preloadArt([next]);
    return { now, next };
  });

  if (!pair.now) return null;
  return (
    <div
      className={cx(s.peeker, className)}
      aria-hidden="true"
      onAnimationIteration={(e) =>
        e.target === e.currentTarget &&
        setPair(({ next }) => {
          const after = randomOther(pool, next);
          void preloadArt([after]);
          return { now: next, next: after };
        })
      }
    >
      <span className={s.peekQ}>?</span>
      <PokeArt key={pair.now.dex} mon={pair.now} revealed={false} fill={0.96} />
    </div>
  );
}
