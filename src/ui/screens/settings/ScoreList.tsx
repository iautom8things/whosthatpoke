// Tonight's scores in the Party tab, each with a bin: the host takes one bad name off the board
// and everyone else stays.
import { useState } from "react";
import { leaderboard, type ScoreEntry } from "../../../game/leaderboard";
import { Button, ConfirmDialog, IconBack, IconButton, toast } from "../../components";
import { timeAgo } from "../results/ago";
import { buddyMon } from "../results/buddies";
import { MonThumb } from "../results/MonThumb";
import { IconTrash } from "./icons";
import { COLLAPSED } from "./partyScores";
import s from "./Settings.module.css";

const scoreText = (e: ScoreEntry) => (e.mode === "survival" ? `🔥 ${e.correct} named` : `⭐ ${e.points.toLocaleString()} points`);

export function ScoreList({ entries }: { entries: readonly ScoreEntry[] }) {
  const [showAll, setShowAll] = useState(false);
  // The target outlives `open`, so the dialog keeps its name while it closes.
  const [target, setTarget] = useState<ScoreEntry | null>(null);
  const [open, setOpen] = useState(false);
  const now = Date.now();
  const shown = showAll ? entries : entries.slice(0, COLLAPSED);

  const remove = () => {
    if (target && leaderboard.remove(target.id)) toast(`${target.name} is off the board.`, { tone: "good" });
    setOpen(false);
  };

  return (
    <div className={s.scores}>
      <ul className={s.scoreList} aria-label="Tonight’s scores">
        {shown.map((e) => {
          const buddy = buddyMon(e.buddy);
          return (
            <li key={e.id} className={s.score}>
              <span className={s.scoreAvatar}>{buddy && <MonThumb mon={buddy} alt="" />}</span>
              <span className={s.scoreText}>
                <span className={s.scoreName}>{e.name}</span>
                <span className={s.scoreMeta}>
                  {scoreText(e)} · {timeAgo(e.at, now)}
                </span>
              </span>
              <IconButton
                icon={<IconTrash />}
                label={`Remove ${e.name}`}
                onPress={() => {
                  setTarget(e);
                  setOpen(true);
                }}
              />
            </li>
          );
        })}
      </ul>
      {entries.length > COLLAPSED && (
        <Button variant="ghost" className={s.scoresMore} onPress={() => setShowAll((v) => !v)}>
          {showAll ? "Show fewer" : `Show all ${entries.length}`}
        </Button>
      )}
      <ConfirmDialog
        open={open}
        tone="danger"
        title={`Remove ${target?.name ?? ""}?`}
        message="Their score comes off the leaderboard for good. Everyone else stays."
        confirmLabel="Remove"
        cancelLabel="Cancel"
        cancelIcon={<IconBack />}
        onConfirm={remove}
        onCancel={() => setOpen(false)}
      />
    </div>
  );
}
