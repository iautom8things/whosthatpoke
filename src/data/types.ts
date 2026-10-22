export const POKE_TYPES = [
  "normal", "fire", "water", "grass", "electric", "ice", "fighting", "poison", "ground",
  "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy",
] as const;
export type PokeType = (typeof POKE_TYPES)[number];

export const REGIONS = [
  "kanto", "johto", "hoenn", "sinnoh", "unova", "kalos", "alola", "galar", "paldea",
] as const;
export type RegionId = (typeof REGIONS)[number];

/** 1 = easy (very famous) ... 4 = master (deep cut). */
export type Tier = 1 | 2 | 3 | 4;

export type MonTag =
  | "starter"
  | "spooky"
  | "ultra-beast"
  | "paradox"
  | "fossil"
  | "baby"
  | "eeveelution"
  | "pseudo-legendary";

/** The game whose Pokédex a fact comes from (scripts/lib/fact-source.mjs). */
export interface FactSource {
  /** The earliest game that prints the entry, e.g. "Pokémon Sword", "Pokémon Legends: Arceus". */
  game: string;
  /** The fact trims or rewords that entry, e.g. to be kind to small kids. */
  adapted: boolean;
}

/** One species, default form. Built by scripts/build-catalog.mjs into catalog.json. */
export interface Mon {
  dex: number;
  slug: string;
  /** Display name, e.g. "Mr. Mime", "Nidoran♀". */
  name: string;
  /** What the announcer should say (pronunciation respelling, or the name). */
  say: string;
  gen: number;
  region: RegionId;
  types: PokeType[];
  legendary: boolean;
  mythical: boolean;
  tags: MonTag[];
  /** Path relative to the app base, e.g. "pokemon/25.svg". */
  art: string;
  /** 1 = most recognizable. */
  rank: number;
  tier: Tier;
  /** e.g. "Mouse Pokémon". */
  genus?: string;
  /** Kid-friendly Pokédex line. */
  fact?: string;
  /** Where the fact comes from, for the fact card's footnote (never spoken). Null when no Pokédex entry matches it. */
  factSource?: FactSource | null;
  color?: string;
  shape?: string;
  /** Evolution chain id. Same family = related Pokémon. */
  family: number;
  /** Normalized alpha bounding box [x, y, w, h] in 0..1 of the art canvas. */
  bbox?: [number, number, number, number];
  /** Dex numbers whose silhouettes can't be told from this one (data/silhouettes.json). */
  twins?: number[];
  /** A featureless silhouette (a plain circle, egg or cloud). Kept out of Poké Ball and Great Ball answers. */
  blob?: true;
  /** Where the fact card says it is from, when that differs from its region's label (e.g. "Hisui"). */
  place?: string;
}
