import raw from "./catalog.json";
import type { Mon } from "./types";

export const CATALOG: readonly Mon[] = raw as Mon[];

const BY_DEX = new Map<number, Mon>(CATALOG.map((m) => [m.dex, m]));

export function monByDex(dex: number): Mon {
  const mon = BY_DEX.get(dex);
  if (!mon) throw new Error(`Unknown dex ${dex}`);
  return mon;
}

/** Absolute-ish URL for a Pokémon's art, honoring Vite's base. */
export function artUrl(mon: Pick<Mon, "art">): string {
  return `${import.meta.env.BASE_URL}${mon.art}`;
}
