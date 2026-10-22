export type DifficultyId = "easy" | "medium" | "hard" | "master";

export interface Difficulty {
  id: DifficultyId;
  /** Poké Ball names double as difficulty names. */
  label: string;
  ball: "poke" | "great" | "ultra" | "master";
  blurb: string;
  /** Seconds per question when the timer is on. */
  seconds: number;
  /** Answer buttons per question. */
  choices: number;
  /** Points multiplier for the leaderboard. */
  multiplier: number;
}

export const DIFFICULTIES: readonly Difficulty[] = [
  { id: "easy", label: "Poké Ball", ball: "poke", blurb: "Super famous Pokémon. Great for little trainers!", seconds: 20, choices: 4, multiplier: 1 },
  { id: "medium", label: "Great Ball", ball: "great", blurb: "Fan favorites. You've seen these on cards and TV.", seconds: 15, choices: 4, multiplier: 1.5 },
  { id: "hard", label: "Ultra Ball", ball: "ultra", blurb: "Trickier picks and look-alike answers.", seconds: 12, choices: 4, multiplier: 2 },
  { id: "master", label: "Master Ball", ball: "master", blurb: "Deep cuts for true Pokémon Masters.", seconds: 10, choices: 4, multiplier: 3 },
];

export function difficultyById(id: DifficultyId): Difficulty {
  return DIFFICULTIES.find((d) => d.id === id) ?? DIFFICULTIES[0];
}
