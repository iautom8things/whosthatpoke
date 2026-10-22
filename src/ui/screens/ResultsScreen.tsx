// End of a game: drumroll, score, prize ticket, recap, then "Add my name" or play again.
import { useLayoutEffect, useMemo, useRef } from "react";
import { useNav } from "../../state/nav";
import { useSession } from "../../state/session";
import { useSettings } from "../../state/settings";
import { Button, Display, IconPlay, PokeBall, ScreenFrame } from "../components";
import { NameEntry } from "./results/NameEntry";
import { claimGame, gameKey, useResultsUi } from "./results/state";
import { Summary } from "./results/Summary";
import { summarize, type GameSummary } from "./results/model";

export default function ResultsScreen() {
  const config = useSession((s) => s.config);
  const phase = useSession((s) => s.phase);
  const rounds = useSession((s) => s.rounds);
  const correct = useSession((s) => s.correct);
  const score = useSession((s) => s.score);
  const bestStreak = useSession((s) => s.bestStreak);
  const tiers = useSettings((s) => s.prizeTiers);
  const liveKey = gameKey({ config, rounds, score });

  const liveSummary = useMemo(
    () => (config && rounds.length > 0 ? summarize({ config, rounds, correct, score, bestStreak }, tiers) : null),
    [config, rounds, correct, score, bestStreak, tiers],
  );

  // Play again starts the next game while this screen is still fading out. Keep showing the
  // finished game until it's gone, or the exit flashes "No game yet!" (or replays the drumroll).
  const last = useRef<{ key: string | null; summary: GameSummary } | null>(null);
  const leaving = last.current !== null && (phase !== "done" || !liveSummary);
  if (!leaving && liveSummary) last.current = { key: liveKey, summary: liveSummary };
  const key = leaving ? last.current!.key : liveKey;
  const summary = leaving ? last.current!.summary : liveSummary;

  // Before the first paint, so a new game never flashes the previous one's "Saved!" state.
  useLayoutEffect(() => claimGame(key), [key]);
  const owned = useResultsUi((s) => s.key === key);
  const view = useResultsUi((s) => s.view);

  if (!summary) return <NoGame />;
  if (!owned) return null;
  if (view === "name" && summary.mode !== "host") return <NameEntry summary={summary} />;
  return <Summary key={key} summary={summary} />;
}

function NoGame() {
  return (
    <ScreenFrame layout="center" back>
      <PokeBall kind="poke" size="clamp(80px, 18vmin, 180px)" animate="bounce" />
      <Display size="2xl">No game yet!</Display>
      <Button size="xl" icon={<IconPlay />} onPress={() => useNav.getState().go("category")}>
        Let’s play
      </Button>
    </ScreenFrame>
  );
}
