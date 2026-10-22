// Turns a finished session into what the results screen shows and says.
import type { GameConfig, Mode } from "../../../game/deck";
import { DEFAULT_PRIZE_TIERS, nextTier, prizeFor, tierThreshold, type PrizeTier } from "../../../game/scoring";
import type { Round } from "../../../state/session";

export interface GameSummary {
  mode: Mode;
  config: GameConfig;
  rounds: readonly Round[];
  correct: number;
  /** Questions asked (classic/host: the game length; survival: how far the run got). */
  asked: number;
  /** Prize ladder scale: classic and host use the game length, survival the settings' round count. */
  scale: number;
  points: number;
  bestStreak: number;
  tier: PrizeTier;
  /** 0 = lowest prize. */
  tierIndex: number;
  tierCount: number;
  next: { tier: PrizeTier; needed: number } | null;
  perfect: boolean;
}

export function summarize(
  game: { config: GameConfig; rounds: readonly Round[]; correct: number; score: number; bestStreak: number },
  tierSetting: readonly PrizeTier[] | null,
): GameSummary {
  const tiers = tierSetting && tierSetting.length > 0 ? tierSetting : DEFAULT_PRIZE_TIERS;
  const { config, rounds, correct } = game;
  const scale = config.rounds > 0 ? config.rounds : 10;
  const tier = prizeFor(correct, scale, tiers);
  const ladder = [...tiers].sort((a, b) => tierThreshold(a, scale) - tierThreshold(b, scale) || a.minCorrect - b.minCorrect);
  const asked = config.mode === "survival" ? rounds.length : Math.max(config.rounds, rounds.length);
  return {
    mode: config.mode,
    config,
    rounds,
    correct,
    asked,
    scale,
    points: game.score,
    bestStreak: game.bestStreak,
    tier,
    tierIndex: Math.max(0, ladder.indexOf(tier)),
    tierCount: ladder.length,
    next: nextTier(correct, scale, tiers),
    perfect: config.mode !== "survival" && asked > 0 && correct >= asked,
  };
}

/** Small word above the big number. */
export function headline(s: GameSummary): string {
  if (s.perfect) return "Perfect!";
  if (s.mode === "survival") return "You named";
  if (s.mode === "host") return "Your team got";
  return s.correct === 0 ? "Nice try!" : "You got";
}

/** The teaser under the score. Always says something, so its slot never sits empty. */
export function teaser(s: GameSummary): { text: string; emoji: string; close: boolean } {
  if (!s.next) return { text: s.perfect ? "Every single one! WOW!" : "Top prize! You're a legend!", emoji: "🌟", close: false };
  const { tier, needed } = s.next;
  if (needed === 1) return { text: `Just 1 more for ${tier.title}!`, emoji: tier.emoji, close: true };
  if (needed === 2) return { text: `Only 2 more for ${tier.title}!`, emoji: tier.emoji, close: true };
  return { text: `Get ${s.correct + needed} for ${tier.title}!`, emoji: tier.emoji, close: false };
}

/** Speech-friendly text: no emoji, "+" read as "and", shouted words lowercased so they aren't spelled out. */
export function spoken(text: string): string {
  return text
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s*\+\s*/g, " and ")
    .replace(/\b[A-Z]{2,}\b/g, (w) => w.toLowerCase())
    .replace(/\s+/g, " ")
    .trim();
}

/** What the announcer says when the prize appears. */
export function announcement(s: GameSummary): string {
  const score =
    s.mode === "survival"
      ? `You named ${s.correct} Pokémon!`
      : s.perfect
        ? `Perfect score! ${s.correct} out of ${s.asked}!`
        : `${s.mode === "host" ? "Your team got" : "You got"} ${s.correct} out of ${s.asked}!`;
  return spoken(`${score} ${s.tier.title}! ${s.tier.reward}`);
}

/** Big reward text shrinks with length; long rewards get the smaller size class. */
export function rewardSize(reward: string): "short" | "medium" | "long" {
  const n = [...reward].length;
  return n <= 12 ? "short" : n <= 20 ? "medium" : "long";
}
