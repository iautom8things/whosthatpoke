import { CATALOG } from "../data/catalog";
import type { Mon, PokeType, RegionId } from "../data/types";

export type CategoryGroup = "featured" | "region" | "type";

/** A theme a player can pick: "only Kanto", "only Ice", "only Legendary"... */
export interface Category {
  id: string;
  group: CategoryGroup;
  label: string;
  blurb: string;
  /** Dex number of the Pokémon shown on the category card. */
  mascot: number;
  /** Card accent color (CSS). */
  accent: string;
  test: (mon: Mon) => boolean;
}

const REGION_INFO: Record<RegionId, { label: string; mascot: number; accent: string; gen: number }> = {
  kanto: { label: "Kanto", mascot: 25, accent: "#e3350d", gen: 1 },
  johto: { label: "Johto", mascot: 249, accent: "#c9a227", gen: 2 },
  hoenn: { label: "Hoenn", mascot: 384, accent: "#2e8b57", gen: 3 },
  sinnoh: { label: "Sinnoh", mascot: 448, accent: "#5b6ee1", gen: 4 },
  unova: { label: "Unova", mascot: 571, accent: "#3b3b3b", gen: 5 },
  kalos: { label: "Kalos", mascot: 658, accent: "#2f6fd6", gen: 6 },
  alola: { label: "Alola", mascot: 778, accent: "#f28c28", gen: 7 },
  galar: { label: "Galar", mascot: 888, accent: "#9b2fae", gen: 8 },
  paldea: { label: "Paldea", mascot: 906, accent: "#d9334f", gen: 9 },
};

export const TYPE_INFO: Record<PokeType, { label: string; color: string; mascot: number }> = {
  normal: { label: "Normal", color: "#9fa19f", mascot: 143 },
  fire: { label: "Fire", color: "#e62829", mascot: 6 },
  water: { label: "Water", color: "#2980ef", mascot: 9 },
  grass: { label: "Grass", color: "#3fa129", mascot: 1 },
  electric: { label: "Electric", color: "#fac000", mascot: 25 },
  ice: { label: "Ice", color: "#3dcef3", mascot: 144 },
  fighting: { label: "Fighting", color: "#ff8000", mascot: 448 },
  poison: { label: "Poison", color: "#9141cb", mascot: 89 },
  ground: { label: "Ground", color: "#915121", mascot: 51 },
  flying: { label: "Flying", color: "#81b9ef", mascot: 18 },
  psychic: { label: "Psychic", color: "#ef4179", mascot: 150 },
  bug: { label: "Bug", color: "#91a119", mascot: 123 },
  rock: { label: "Rock", color: "#afa981", mascot: 95 },
  ghost: { label: "Ghost", color: "#704170", mascot: 94 },
  dragon: { label: "Dragon", color: "#5060e1", mascot: 149 },
  dark: { label: "Dark", color: "#624d4e", mascot: 197 },
  steel: { label: "Steel", color: "#60a1b8", mascot: 376 },
  fairy: { label: "Fairy", color: "#ef70ef", mascot: 700 },
};

const FEATURED: Category[] = [
  { id: "all", group: "featured", label: "All Pokémon", blurb: "Anyone from every region!", mascot: 25, accent: "#ffcb05", test: () => true },
  { id: "spooky", group: "featured", label: "Spooky Night", blurb: "Ghosts, bats and things that go bump.", mascot: 94, accent: "#ff7a1a", test: (m) => m.tags.includes("spooky") || m.types.includes("ghost") },
  { id: "starters", group: "featured", label: "Starters", blurb: "Every first partner and their evolutions.", mascot: 4, accent: "#3fa129", test: (m) => m.tags.includes("starter") },
  { id: "legendary", group: "featured", label: "Legendary", blurb: "The rare and powerful legends.", mascot: 150, accent: "#7b5cff", test: (m) => m.legendary },
  { id: "mythical", group: "featured", label: "Mythical", blurb: "The rarest Pokémon of all.", mascot: 151, accent: "#ff5fa2", test: (m) => m.mythical },
];

const REGION_CATEGORIES: Category[] = (Object.keys(REGION_INFO) as RegionId[]).map((id) => {
  const info = REGION_INFO[id];
  return {
    id: `region-${id}`,
    group: "region",
    label: info.label,
    blurb: `Only Pokémon first found in ${info.label}.`,
    mascot: info.mascot,
    accent: info.accent,
    test: (m: Mon) => m.region === id,
  };
});

const TYPE_CATEGORIES: Category[] = (Object.keys(TYPE_INFO) as PokeType[]).map((type) => {
  const info = TYPE_INFO[type];
  return {
    id: `type-${type}`,
    group: "type",
    label: info.label,
    blurb: `Only ${info.label}-type Pokémon.`,
    mascot: info.mascot,
    accent: info.color,
    test: (m: Mon) => m.types.includes(type),
  };
});

export const CATEGORIES: readonly Category[] = [...FEATURED, ...REGION_CATEGORIES, ...TYPE_CATEGORIES];

export function categoryById(id: string): Category {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[0];
}

const poolCache = new Map<string, readonly Mon[]>();

/** Every species in a category, most recognizable first. */
export function categoryPool(id: string): readonly Mon[] {
  let pool = poolCache.get(id);
  if (!pool) {
    const category = categoryById(id);
    pool = CATALOG.filter(category.test).sort((a, b) => a.rank - b.rank);
    poolCache.set(id, pool);
  }
  return pool;
}
