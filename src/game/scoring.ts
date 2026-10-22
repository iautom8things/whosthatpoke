import { difficultyById, type DifficultyId } from "./difficulty";

export interface AnswerInput {
  correct: boolean;
  /** Time left on the clock when answered, ms. Pass totalMs when the timer is off. */
  msLeft: number;
  totalMs: number;
  /** Streak before this answer. */
  streak: number;
  difficulty: DifficultyId;
}

export interface AnswerScore {
  points: number;
  /** Breakdown for the "+250" popup. Already multiplied; the three parts add up to `points`. */
  base: number;
  speedBonus: number;
  streakBonus: number;
}

export const BASE_POINTS = 100;
export const MAX_SPEED_BONUS = 100;
export const STREAK_STEP = 25;
export const MAX_STREAK_BONUS = 100;

const NONE: AnswerScore = { points: 0, base: 0, speedBonus: 0, streakBonus: 0 };
const round10 = (n: number) => Math.round(n / 10) * 10;
const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** Wrong scores 0. Right scores (base + speed + streak) x the difficulty multiplier, to the nearest 10. */
export function scoreAnswer(input: AnswerInput): AnswerScore {
  if (!input.correct) return NONE;
  const multiplier = difficultyById(input.difficulty).multiplier;
  const speed = input.totalMs > 0 ? MAX_SPEED_BONUS * clamp01(input.msLeft / input.totalMs) : 0;
  const streak = Math.min(MAX_STREAK_BONUS, STREAK_STEP * Math.max(0, Math.floor(input.streak)));
  const points = round10((BASE_POINTS + speed + streak) * multiplier);
  const base = round10(BASE_POINTS * multiplier);
  const streakBonus = round10(streak * multiplier);
  return { points, base, streakBonus, speedBonus: Math.max(0, points - base - streakBonus) };
}

export interface PrizeTier {
  /** Correct answers needed, out of 10. Scaled for other round counts. */
  minCorrect: number;
  title: string;
  /** What the host hands over, e.g. "BIG candy!". */
  reward: string;
  emoji: string;
  color: string;
}

export const DEFAULT_PRIZE_TIERS: readonly PrizeTier[] = [
  { minCorrect: 0, title: "Rookie Trainer", reward: "Grab a treat!", emoji: "🍬", color: "#4fc3f7" },
  { minCorrect: 5, title: "Ace Trainer", reward: "BIG candy!", emoji: "🍫", color: "#ff9f1c" },
  { minCorrect: 8, title: "Gym Leader", reward: "BIG candy + bragging rights!", emoji: "🏆", color: "#b46cff" },
  { minCorrect: 10, title: "Pokémon Master", reward: "Pick ANY candy you want!", emoji: "👑", color: "#ffd23f" },
];

/** Correct answers a tier needs in a game of `rounds`: ceil(minCorrect * rounds / 10). */
export function tierThreshold(tier: PrizeTier, rounds: number): number {
  const r = rounds > 0 ? rounds : 10;
  return Math.ceil((Math.max(0, tier.minCorrect) * r) / 10);
}

/** Tiers in climbing order; ties on the scaled threshold go to the bigger prize last. */
function ladder(rounds: number, tiers: readonly PrizeTier[]): { tier: PrizeTier; need: number }[] {
  const list = tiers.length > 0 ? tiers : DEFAULT_PRIZE_TIERS;
  return list
    .map((tier) => ({ tier, need: tierThreshold(tier, rounds) }))
    .sort((a, b) => a.need - b.need || a.tier.minCorrect - b.tier.minCorrect);
}

/** Picks the tier for a result. `tiers` may come from settings. */
export function prizeFor(correct: number, rounds: number, tiers: readonly PrizeTier[] = DEFAULT_PRIZE_TIERS): PrizeTier {
  const steps = ladder(rounds, tiers);
  let best = steps[0].tier;
  for (const step of steps) if (correct >= step.need) best = step.tier;
  return best;
}

/** The next prize up and how many more correct answers it takes, or null at the top. */
export function nextTier(
  correct: number,
  rounds: number,
  tiers: readonly PrizeTier[] = DEFAULT_PRIZE_TIERS,
): { tier: PrizeTier; needed: number } | null {
  const steps = ladder(rounds, tiers);
  const above = steps.filter((s) => s.need > correct);
  if (above.length === 0) return null;
  const need = above[0].need;
  const top = above.filter((s) => s.need === need).at(-1)!;
  return { tier: top.tier, needed: need - correct };
}
