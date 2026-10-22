// Every word the game screen shows or says. Short, upbeat, readable by a 6-year-old.

export const COPY = {
  ask: "Who’s that Pokémon?",
  reveal: (name: string) => `It’s ${name}!`,
  timeUp: "Time’s up!",
  niceTry: "Nice try!",
  right: "Right",
  fast: "Speedy",
  streakBonus: "Streak",
  next: "Next",
  results: "Results",
  seeScore: "See my score",
  gameOver: "Game over!",
  caught: (n: number) => (n === 1 ? "You caught 1 Pokémon!" : `You caught ${n} Pokémon!`),
  ballsLeft: (n: number) => (n <= 0 ? "Out of balls!" : n === 1 ? "Last ball!" : `${n} balls left`),
  streak: (n: number) => `${n} in a row!`,
  streakCheer: (n: number) => (n >= 10 ? "Unstoppable!" : n >= 5 ? "On fire!" : "Hot streak!"),
  quitTitle: "Quit this game?",
  quitMessage: "Your score won’t be saved.",
  quitYes: "Quit",
  quitButton: "Quit game",
  /** Read out on Poké Ball for kids who can't read the names yet. Pass Mon.say, which the voice pronounces right. */
  choices: (names: readonly string[]) =>
    names.length < 2 ? (names[0] ?? "") : `Is it ${names.slice(0, -1).join(", ")}, or ${names[names.length - 1]}?`,
  quitNo: "Keep playing",
  dex: (n: number) => `#${String(n).padStart(3, "0")}`,
  gen: (n: number) => `Gen ${n}`,
} as const;
