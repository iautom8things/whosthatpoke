import { motion } from "motion/react";
import { useMemo, useSyncExternalStore } from "react";
import { leaderboard, TONIGHT_MS } from "../../../game/leaderboard";
import { cx, IconTrophy } from "../../components";
import { findMon, MonImg } from "./shared";
import s from "./menus.module.css";

const subscribe = (fn: () => void) => leaderboard.subscribe(fn);
const snapshot = () => leaderboard.all();

/** "Tonight's top trainer" banner: tonight's best classic score, or nothing before the first game. */
export function TopTrainer({ className }: { className?: string }) {
  const entries = useSyncExternalStore(subscribe, snapshot, snapshot);
  const top = useMemo(() => leaderboard.top("classic", 1, TONIGHT_MS())[0], [entries]);
  if (!top) return null;
  return (
    <motion.div
      className={cx(s.ticker, className)}
      initial={{ opacity: 0, y: 16, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.7, type: "spring", stiffness: 380, damping: 22 }}
      role="status"
    >
      <span className={s.tickerMedal}>
        <MonImg mon={findMon(top.buddy)} className={s.tickerBuddy} />
      </span>
      <span className={s.tickerText}>
        <span className={s.tickerLabel}>
          <IconTrophy /> Tonight’s top trainer
        </span>
        <span className={s.tickerRow}>
          <span className={s.tickerName}>{top.name}</span>
          <span className={s.tickerPoints}>
            {top.points.toLocaleString()}
            <small> pts</small>
          </span>
        </span>
      </span>
    </motion.div>
  );
}
