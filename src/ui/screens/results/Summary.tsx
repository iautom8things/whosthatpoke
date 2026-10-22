import { useEffect, useMemo, useRef, useState } from "react";
import { announcer, audio } from "../../../audio";
import { categoryById } from "../../../game/categories";
import { difficultyById } from "../../../game/difficulty";
import { leaderboard, TONIGHT_MS } from "../../../game/leaderboard";
import { useKeys } from "../../../lib/useKeys";
import { useReducedMotion } from "../../../lib/reducedMotion";
import { useViewport } from "../../../lib/useViewport";
import { useNav } from "../../../state/nav";
import { useSession } from "../../../state/session";
import { Button, celebrate, clearConfetti, Display, IconButton, IconCheck, IconHome, IconRefresh, IconTrophy, PokeBall, ScreenFrame, useCountUp } from "../../components";
import { PrizeCard } from "./PrizeCard";
import { Recap } from "./Recap";
import { useResultsUi } from "./state";
import { announcement, headline, teaser, type GameSummary } from "./model";
import s from "./Summary.module.css";

/** 0 drumroll, 1 score counts up, 2 prize revealed, 3 buttons live. */
type Stage = 0 | 1 | 2 | 3;

const DRUMROLL_MS = 1300;
const COUNT_MS = 1100;
const SETTLE_MS = 900;

export function Summary({ summary }: { summary: GameSummary }) {
  const reduce = useReducedMotion();
  const vp = useViewport();
  const celebratedAlready = useRef(useResultsUi.getState().celebrated);
  const [stage, setStage] = useState<Stage>(() => (celebratedAlready.current ? 3 : reduce || useResultsUi.getState().instant ? 2 : 0));
  useEffect(() => useResultsUi.setState({ instant: false }), []);
  const fired = useRef(celebratedAlready.current);
  const { mode, tier, correct, asked, points, config } = summary;
  const level = summary.tierCount > 1 ? summary.tierIndex / (summary.tierCount - 1) : 1;

  // ---- the ceremony ----
  useEffect(() => {
    if (stage === 0) {
      audio.stopSong(300);
      audio.sfx("drumroll");
      const t = window.setTimeout(() => setStage(1), DRUMROLL_MS);
      return () => window.clearTimeout(t);
    }
    if (stage === 1) {
      const t = window.setTimeout(() => setStage(2), COUNT_MS);
      return () => window.clearTimeout(t);
    }
    if (stage === 2) {
      if (!fired.current) {
        fired.current = true;
        useResultsUi.setState({ celebrated: true });
        audio.sfx(level >= 0.5 ? "prize" : "fanfare");
        if (level >= 1) {
          celebrate("cannons", { intensity: 1.3 });
          celebrate("stars", { origin: { x: 0.3, y: 0.4 } });
        } else {
          celebrate("burst", { origin: { x: vp.orientation === "landscape" ? 0.27 : 0.5, y: 0.5 }, intensity: 0.6 + level * 0.8 });
        }
      }
      const say = window.setTimeout(() => void announcer.say(announcement(summary)), 700);
      const song = window.setTimeout(() => audio.playSong("results"), 1800);
      const ready = window.setTimeout(() => setStage(3), SETTLE_MS);
      return () => [say, song, ready].forEach((t) => window.clearTimeout(t));
    }
    audio.playSong("results");
    return undefined;
    // The summary is fixed for the life of this view, so only the stage drives this.
  }, [stage]);

  useEffect(
    () => () => {
      announcer.cancel();
      clearConfetti();
    },
    [],
  );

  const skip = () => {
    if (stage < 2) setStage(2);
  };

  // ---- the numbers ----
  const shownCorrect = useCountUp(stage >= 1 ? correct : 0, Math.min(COUNT_MS - 200, 120 * Math.max(1, correct)));
  const shownPoints = useCountUp(stage >= 1 ? points : 0, COUNT_MS);
  const lastTick = useRef(shownCorrect);
  useEffect(() => {
    if (stage === 1 && shownCorrect !== lastTick.current) audio.sfx("points");
    lastTick.current = shownCorrect;
  }, [shownCorrect, stage]);

  // ---- leaderboard offer (classic and survival) ----
  const savedId = useResultsUi((st) => st.savedId);
  const boardMode = mode === "host" ? null : mode;
  const rank = useMemo(() => {
    if (!boardMode) return null;
    return savedId ? leaderboard.rankOf(savedId, 10, TONIGHT_MS()) : leaderboard.rankFor(boardMode, points, correct, 10, TONIGHT_MS());
  }, [boardMode, savedId, points, correct]);

  // ---- actions ----
  const nav = useNav.getState();
  const playAgain = () => {
    clearConfetti();
    useSession.getState().start();
    nav.go(mode === "host" ? "host" : "game", { replace: true });
  };
  const newTheme = () => {
    clearConfetti();
    nav.home();
    useNav.getState().go("category");
  };
  const home = () => {
    clearConfetti();
    nav.home();
  };

  useKeys({ "Space|Enter|ArrowRight|PageDown": skip }, { enabled: stage < 2 });
  useKeys({ "ArrowRight|PageDown": playAgain }, { enabled: stage === 3 });

  const big = vp.orientation === "landscape" && !vp.short && vp.size !== "phone";
  const tease = teaser(summary);
  const category = categoryById(config.categoryId);
  const difficulty = difficultyById(config.difficulty);
  const live = stage === 3;
  // Short landscape screens (phone sideways, 480p projector) have no height to spare in the side column.
  const offerInActions = vp.orientation === "landscape" && vp.short;
  const offer = boardMode && (
    <div className={s.board} data-show={stage >= 2 || undefined} data-inline={offerInActions || undefined} inert={!live}>
      {savedId ? (
        <Button variant="ghost" size="md" block={!offerInActions} icon={<IconCheck />} onPress={() => nav.go("leaderboard")}>
          {rank ? `Saved! You're #${rank}` : "Saved! See the board"}
        </Button>
      ) : (
        <Button variant="success" size={big ? "lg" : "md"} block={!offerInActions} icon={<IconTrophy />} onPress={() => useResultsUi.setState({ view: "name" })}>
          Add my name!
          {rank && <span className={s.rank}>#{rank}</span>}
        </Button>
      )}
    </div>
  );

  return (
    <ScreenFrame layout="fill" bodyClassName={s.body}>
      <div className={s.grid} data-mode={mode} onPointerDown={stage < 2 ? skip : undefined}>
        <PrizeCard className={s.prize} tier={tier} open={stage >= 2} ball={difficulty.ball} level={level} />

        <div className={s.side}>
          <div className={s.score}>
            <span className={s.context}>
              <PokeBall kind={difficulty.ball} size="1.25em" title={difficulty.label} />
              {category.label}
            </span>
            <Display size="lg" className={s.headline} color={summary.perfect ? "var(--hi)" : undefined}>
              {headline(summary)}
            </Display>
            <div className={s.hero}>
              <Display size="hero" color="var(--hi)" className={s.big} style={{ minWidth: `${String(Math.max(asked, correct)).length * 0.8}em` }}>
                {stage === 0 ? "?" : shownCorrect}
              </Display>
              {mode !== "survival" ? (
                <Display size="3xl" className={s.of}>
                  /{asked}
                </Display>
              ) : (
                <Display size="xl" className={s.unit}>
                  Pokémon!
                </Display>
              )}
            </div>
            <p className={s.points} style={{ opacity: stage >= 1 ? 1 : 0 }}>
              {mode === "survival" && (
                <span className={s.streak}>
                  🔥 Best streak <b>{summary.bestStreak}</b>
                </span>
              )}
              <span>
                <b>{shownPoints.toLocaleString()}</b> points
              </span>
            </p>
          </div>

          <p className={s.teaser} data-close={tease.close || undefined} data-show={stage >= 2 || undefined}>
            <span className={s.teaserEmoji} aria-hidden="true">
              {tease.emoji}
            </span>
            <span>{tease.text}</span>
          </p>

          <Recap className={s.recap} rounds={summary.rounds} show={stage >= 2} />

          {!offerInActions && offer}
        </div>

        <div className={s.actions} data-show={live || undefined} inert={!live}>
          <IconButton icon={<IconHome />} label="Home" size={big ? "lg" : "md"} sfx="back" onPress={home} />
          <Button variant="secondary" size={big ? "lg" : "md"} onPress={newTheme}>
            New theme
          </Button>
          {offerInActions && offer}
          <Button variant="primary" size={big ? "lg" : "md"} icon={<IconRefresh />} onPress={playAgain} className={s.again}>
            Play again
          </Button>
        </div>
      </div>
      {stage < 2 && (
        <span className="wtp-sr-only" role="status">
          Drumroll please…
        </span>
      )}
    </ScreenFrame>
  );
}
