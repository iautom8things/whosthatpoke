// CONTRACT: implemented by the game-logic agent. Remembers recently shown answers across games
// (localStorage "wtp.recent.v1") so the same Pokémon doesn't come up for every trick-or-treater.

export function recentAnswers(): number[] {
  return [];
}

export function rememberAnswers(dex: readonly number[]): void {
  void dex;
}

export function clearRecent(): void {}
