import { motion } from "motion/react";
import { useRef, type CSSProperties } from "react";
import { useKeys } from "../../../lib/useKeys";
import { SURVIVAL_LIVES, useSession } from "../../../state/session";
import { useSettings } from "../../../state/settings";
import { ConfirmDialog, IconButton, IconX, ScreenFrame } from "../../components";
import { ActionBar } from "./ActionBar";
import { Answers } from "./Answers";
import { COPY } from "./copy";
import { GameOver } from "./GameOver";
import { DotsRow, HudCenter, HudScore } from "./Hud";
import { Stage } from "./Stage";
import { useGameLoop } from "./useGameLoop";
import s from "./game.module.css";

/** Longest word, so a display title can shrink until it fits on its own line. */
const longestWord = (text: string) => Math.max(8, ...text.split(/\s+/).map((w) => w.length));

/** Classic and survival play: silhouette, four names, reveal, repeat. */
export default function Game() {
  const stageRef = useRef<HTMLDivElement>(null);
  const g = useGameLoop(stageRef);
  const config = useSession((st) => st.config);
  const rounds = useSession((st) => st.rounds);
  const score = useSession((st) => st.score);
  const streak = useSession((st) => st.streak);
  const bestStreak = useSession((st) => st.bestStreak);
  const lives = useSession((st) => st.lives);
  const correct = useSession((st) => st.correct);
  const timer = useSettings((st) => st.timer);

  const q = g.question;
  const survival = config?.mode === "survival";
  const revealed = g.phase === "revealed" || g.phase === "done";
  const live = g.phase === "asking" && g.picked === null && !g.timedOut;
  const total = config?.rounds ?? 10;
  const index = q?.index ?? 0;

  useKeys(
    {
      "1|a": () => g.pickIndex(0),
      "2|b": () => g.pickIndex(1),
      "3|c": () => g.pickIndex(2),
      "4|d": () => g.pickIndex(3),
    },
    { enabled: live },
  );
  useKeys({ "ArrowRight|PageDown|Space|Enter": () => (g.gameOver ? g.finish() : g.next()) }, { enabled: g.phase === "revealed" });

  const askTitle = COPY.ask;
  const revealTitle = q ? COPY.reveal(q.answer.name) : "";

  return (
    <div className={s.root}>
      <ScreenFrame
        layout="fill"
        back={g.askQuit}
        headerLeft={<IconButton icon={<IconX />} label="Quit game" sfx="back" onPress={g.askQuit} />}
        title={
          <HudCenter
            survival={survival}
            total={total}
            index={index}
            rounds={rounds}
            lives={lives}
            maxLives={SURVIVAL_LIVES}
            caught={correct}
          />
        }
        headerRight={<HudScore score={score} streak={streak} />}
      >
        <div className={s.game} data-phase={g.phase} data-survival={survival || undefined}>
          {!survival && <DotsRow total={total} index={index} rounds={rounds} />}

          <Stage
            ref={stageRef}
            mon={q?.answer ?? null}
            artKey={`${config?.seed ?? 0}-${index}`}
            ready={g.ready}
            revealed={revealed}
            timedOut={g.timedOut}
            round={g.round}
            popup={g.popup}
            streakBanner={g.streakBanner}
            survival={survival}
            livesLeft={lives}
            onSwipeNext={g.next}
          />

          <div className={s.side}>
            <div className={s.titleSlot}>
              <motion.h2
                className={`wtp-display ${s.title}`}
                style={{ "--word": longestWord(askTitle) } as CSSProperties}
                initial={false}
                animate={
                  revealed
                    ? { opacity: 0, scale: 0.8, transition: { duration: 0.1 } }
                    : g.ready
                      ? { opacity: 1, scale: 1, rotate: 0, transition: { type: "spring", stiffness: 500, damping: 18 } }
                      : { opacity: 0, scale: 0.6, rotate: -4, transition: { duration: 0 } }
                }
                aria-hidden={revealed || undefined}
              >
                {askTitle}
              </motion.h2>
              <motion.h2
                key={`reveal-${index}`}
                className={`wtp-display ${s.title} ${s.revealTitle}`}
                style={{ "--word": longestWord(revealTitle) } as CSSProperties}
                initial={{ opacity: 0, scale: 0.4, rotate: -6 }}
                animate={
                  revealed
                    ? { opacity: 1, scale: 1, rotate: -2, transition: { type: "spring", stiffness: 520, damping: 14, opacity: { duration: 0.12 } } }
                    : { opacity: 0, scale: 0.4, rotate: -6, transition: { duration: 0 } }
                }
                aria-hidden={!revealed || undefined}
                aria-live="polite"
              >
                {revealTitle}
              </motion.h2>
            </div>

            {q && (
              <Answers question={q} live={live} revealed={revealed} picked={g.picked} factShown={revealed && g.factShown} onPick={g.pick} />
            )}

            <ActionBar
              clock={g.clock}
              totalMs={g.totalMs}
              showTimer={!revealed && timer}
              showNext={g.phase === "revealed"}
              last={g.last}
              auto={g.auto}
              autoStopped={g.autoStopped}
              onNext={g.gameOver ? g.finish : g.next}
            />
          </div>
        </div>
      </ScreenFrame>

      <GameOver open={g.gameOver} caught={correct} bestStreak={bestStreak} onContinue={g.finish} />

      <ConfirmDialog
        open={g.quitOpen}
        title={COPY.quitTitle}
        message={COPY.quitMessage}
        confirmLabel={COPY.quitYes}
        cancelLabel={COPY.quitNo}
        tone="danger"
        onConfirm={g.confirmQuit}
        onCancel={g.cancelQuit}
      />
    </div>
  );
}
