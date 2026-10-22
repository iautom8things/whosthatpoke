import { CATALOG } from "../../../data/catalog";
import type { Mon } from "../../../data/types";
import { isBlockedName } from "../../../game/names";

// Pikachu, Eevee, then every region's grass, fire and water starter.
const BUDDY_DEX = [
  25, 133, 1, 4, 7, 152, 155, 158, 252, 255, 258, 387, 390, 393, 495, 498, 501, 650, 653, 656, 722, 725, 728, 810, 813, 816,
  906, 909, 912,
];

const byDex = new Map(CATALOG.map((m) => [m.dex, m]));

/** Buddy icons a trainer can pick. Skips any species the catalog lacks. */
export const BUDDIES: readonly Mon[] = BUDDY_DEX.flatMap((dex) => byDex.get(dex) ?? []);

export const DEFAULT_BUDDY = 25;

/** A buddy's Mon, or Pikachu for an unknown dex (old or hand-edited entries). */
export function buddyMon(dex: number): Mon | undefined {
  return byDex.get(dex) ?? byDex.get(DEFAULT_BUDDY);
}

// At most 12 characters each, to fit the name field.
const TRAINER_NAMES = [
  "Pumpkin Pal",
  "Spooky Sam",
  "Zippy Zoe",
  "Mega Max",
  "Thunder Tia",
  "Brave Bea",
  "Ghosty Gus",
  "Bat Buddy",
  "Moon Hopper",
  "Jolly Jack",
  "Turbo Trix",
  "Lucky Lulu",
  "Fizzy Fern",
  "Dino Dash",
  "Captain Boo",
  "Super Scout",
  "Glow Wizard",
  "Rocket Ray",
  "Comet Kid",
  "Twinkle Toes",
  "Shadow Fox",
  "Candy Champ",
  "Sparkle Sue",
  "Night Owl",
  "Mighty Mo",
];

export const NAME_MAX = 12;

export function randomTrainerName(avoid?: string): string {
  const pool = TRAINER_NAMES.filter((n) => n !== avoid);
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * The name that goes on the board. Blank or rude gets a fun trainer name instead.
 * Laptop keyboards don't auto-capitalize: "ash ketchum" goes on the board as "Ash Ketchum".
 */
export function boardName(typed: string): string {
  const name = typed.trim().replace(/\s+/g, " ");
  if (!name || isBlockedName(name)) return randomTrainerName();
  return name === name.toLowerCase() ? name.replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase()) : name;
}
