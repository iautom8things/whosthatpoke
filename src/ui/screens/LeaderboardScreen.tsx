// "Tonight's Top Trainers": classic and survival boards, tonight or all time, top 10.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type Ref } from "react";
import { audio } from "../../audio";
import { categoryById } from "../../game/categories";
import { difficultyById } from "../../game/difficulty";
import { leaderboard, TONIGHT_MS, type ScoreEntry } from "../../game/leaderboard";
import { useInterval } from "../../lib/useInterval";
import { useKeys } from "../../lib/useKeys";
import { useViewport } from "../../lib/useViewport";
import { useNav } from "../../state/nav";
import { useSession } from "../../state/session";
import { Button, celebrate, Chip, Display, IconButton, IconHome, IconPlay, Pill, PokeBall, ScreenFrame } from "../components";
import { timeAgo } from "./results/ago";
import { buddyMon } from "./results/buddies";
import s from "./results/Leaderboard.module.css";
import { MonThumb } from "./results/MonThumb";
import { freshHighlight, useResultsUi } from "./results/state";

type BoardMode = ScoreEntry["mode"];
type Range = "tonight" | "all";

const MEDALS = ["gold", "silver", "bronze"] as const;

export default function LeaderboardScreen() {
  const entries = useSyncExternalStore(leaderboard.subscribe, leaderboard.all, leaderboard.all);
  const vp = useViewport();
  const [highlight] = useState(() => freshHighlight());
  const [mode, setMode] = useState<BoardMode>(() => {
    const fresh = highlight ? leaderboard.all().find((e) => e.id === highlight) : undefined;
    const last = useSession.getState().config?.mode;
    return fresh?.mode ?? (last === "survival" ? "survival" : "classic");
  });
  const [range, setRange] = useState<Range>("tonight");
  const [now, setNow] = useState(() => Date.now());
  useInterval(() => setNow(Date.now()), 30_000);

  const since = range === "tonight" ? TONIGHT_MS(now) : undefined;
  const top = useMemo(() => leaderboard.top(mode, 10, since), [entries, mode, since]);
  const mine = useMemo(() => {
    if (!highlight || top.some((e) => e.id === highlight)) return null;
    const entry = entries.find((e) => e.id === highlight && e.mode === mode && (since == null || e.at >= since));
    const rank = entry ? leaderboard.rankOf(entry.id, Infinity, since) : null;
    return entry && rank ? { entry, rank } : null;
  }, [entries, highlight, mode, since, top]);
  // Room for "your spot" under the list without scrolling: the top 8 on roomy screens, 6 on a 480p
  // projector, 4 on a phone on its side.
  const shown = mine ? top.slice(0, vp.h < 440 ? 4 : vp.short ? 6 : 8) : top;
  const cols = shown.length > 5 || mine ? 2 : 1;
  const otherRangeHas = useMemo(() => leaderboard.top(mode, 1, range === "tonight" ? undefined : TONIGHT_MS(now)).length > 0, [entries, mode, range, now]);

  // A just-saved row gets a little party, once: opening the board again later doesn't replay it.
  const newRow = useRef<HTMLLIElement>(null);
  const mineShown = mine !== null;
  useEffect(() => {
    if (!highlight) return;
    useResultsUi.setState({ highlight: null });
    const id = window.setTimeout(() => {
      const el = newRow.current;
      if (!el) return;
      // "Your spot" sits outside the scroller, so the top of the board stays in view.
      if (!mineShown) el.scrollIntoView({ block: "nearest" });
      const r = el.getBoundingClientRect();
      audio.sfx("streak");
      celebrate("stars", { origin: { x: (r.left + r.width / 2) / innerWidth, y: (r.top + r.height / 2) / innerHeight }, intensity: 1.2 });
    }, 350);
    return () => window.clearTimeout(id);
  }, [highlight]);

  const toggleMode = () => {
    setMode((m) => (m === "classic" ? "survival" : "classic"));
    audio.sfx("select");
  };
  const toggleRange = () => {
    setRange((r) => (r === "tonight" ? "all" : "tonight"));
    audio.sfx("select");
  };
  useKeys({ "ArrowLeft|ArrowRight|PageUp|PageDown": toggleMode, "ArrowUp|ArrowDown|t": toggleRange });

  const play = () => {
    useSession.getState().setSetup({ mode });
    useNav.getState().home();
    useNav.getState().go("category");
  };

  const roomy = vp.orientation === "landscape" && !vp.short && vp.size !== "phone";
  const title = range === "tonight" ? "Tonight’s Top Trainers" : "All-Time Top Trainers";

  return (
    <ScreenFrame
      layout="stack"
      back
      title={
        <h1 className={`wtp-display ${s.title}`} data-range={range}>
          {title}
        </h1>
      }
      headerRight={<IconButton icon={<IconHome />} label="Home" showLabel={roomy} sfx="back" onPress={() => useNav.getState().home()} />}
      bodyClassName={s.body}
    >
      <div className={s.controls}>
        <div className={s.group} role="group" aria-label="Game mode">
          <Chip selected={mode === "classic"} onPress={() => setMode("classic")} icon={<span aria-hidden="true">⭐</span>} sfx={mode === "classic" ? null : "select"}>
            Classic
          </Chip>
          <Chip selected={mode === "survival"} onPress={() => setMode("survival")} icon={<span aria-hidden="true">🔥</span>} accent="var(--bad)" sfx={mode === "survival" ? null : "select"}>
            Survival
          </Chip>
        </div>
        <div className={s.group} role="group" aria-label="When">
          <Chip selected={range === "tonight"} onPress={() => setRange("tonight")} icon={<span aria-hidden="true">🌙</span>} accent="var(--accent-3)" sfx={range === "tonight" ? null : "select"}>
            Tonight
          </Chip>
          <Chip selected={range === "all"} onPress={() => setRange("all")} icon={<span aria-hidden="true">🏆</span>} accent="var(--accent-3)" sfx={range === "all" ? null : "select"}>
            All time
          </Chip>
        </div>
      </div>

      {top.length === 0 ? (
        <div className={s.empty}>
          <PokeBall kind={mode === "survival" ? "ultra" : "poke"} size="clamp(72px, 16vmin, 170px)" animate="bounce" />
          <Display size="2xl" className={s.emptyTitle}>
            {range === "tonight" ? "No trainers yet tonight!" : "No trainers yet!"}
          </Display>
          <p className={s.emptyText}>Play a game and put your name up in lights!</p>
          <div className={s.emptyActions}>
            <Button size="lg" icon={<IconPlay />} onPress={play}>
              Play now!
            </Button>
            {range === "tonight" && otherRangeHas && (
              <Button size="lg" variant="ghost" onPress={() => setRange("all")}>
                See all time
              </Button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className={s.scroller}>
            <ol className={s.list} data-cols={cols} style={{ "--rows": Math.ceil(shown.length / 2) } as CSSProperties} aria-label={title}>
              {shown.map((e, i) => (
                <Row key={e.id} entry={e} rank={i + 1} now={now} fresh={e.id === highlight} rowRef={e.id === highlight ? newRow : undefined} />
              ))}
            </ol>
          </div>
          {mine && (
            <div className={s.mine} data-cols={cols}>
              {/* Marks the ranks skipped between the list and you, so #11 doesn't read as 9th. */}
              <span className={s.skip} aria-hidden="true">
                • • •
              </span>
              <ol start={mine.rank} aria-label="Your spot">
                <Row entry={mine.entry} rank={mine.rank} now={now} fresh rowRef={newRow} />
              </ol>
            </div>
          )}
        </>
      )}
    </ScreenFrame>
  );
}

interface RowProps {
  entry: ScoreEntry;
  rank: number;
  now: number;
  fresh?: boolean;
  rowRef?: Ref<HTMLLIElement>;
}

function Row({ entry, rank, now, fresh, rowRef }: RowProps) {
  const buddy = buddyMon(entry.buddy);
  const difficulty = difficultyById(entry.difficulty);
  const category = categoryById(entry.categoryId);
  const medal = MEDALS[rank - 1];
  const survival = entry.mode === "survival";
  return (
    <li ref={rowRef} className={s.row} data-medal={medal} data-fresh={fresh || undefined} style={{ "--i": rank - 1 } as CSSProperties}>
      <span className={`wtp-display ${s.rank}`} aria-label={`Rank ${rank}`}>
        {rank === 1 && (
          <span className={s.crown} aria-hidden="true">
            👑
          </span>
        )}
        {rank}
      </span>
      <span className={s.avatar}>{buddy && <MonThumb mon={buddy} alt="" />}</span>
      <span className={s.who}>
        <span className={s.name}>
          {entry.name}
          {fresh && (
            <Pill tone="accent" size="sm" className={s.newPill}>
              NEW!
            </Pill>
          )}
        </span>
        <span className={s.meta}>
          <PokeBall kind={difficulty.ball} size="1.15em" title={difficulty.label} />
          {/* The time tells siblings apart, so it comes before the category, which phones drop. */}
          <span className={s.metaText}>
            {survival ? `🔥 ${entry.bestStreak} in a row` : `${entry.correct}/${entry.total}`} · {timeAgo(entry.at, now)}
            <span className={s.metaCategory}> · {category.label}</span>
          </span>
        </span>
      </span>
      <span className={s.score}>
        <span className={`wtp-display ${s.value}`}>{(survival ? entry.correct : entry.points).toLocaleString()}</span>
        <span className={s.unit}>{survival ? "named" : "points"}</span>
      </span>
    </li>
  );
}
