import { useEffect, useRef, useState, type CSSProperties } from "react";
import { audio } from "../../../audio";
import { leaderboard } from "../../../game/leaderboard";
import { haptic } from "../../../lib/haptic";
import { useKeys } from "../../../lib/useKeys";
import { useViewport } from "../../../lib/useViewport";
import { useNav } from "../../../state/nav";
import { useSettings } from "../../../state/settings";
import { Burst, Button, Display, IconCheck, PokeArt, ScreenFrame } from "../../components";
import { BUDDIES, buddyMon, DEFAULT_BUDDY, NAME_MAX, randomTrainerName } from "./buddies";
import { MonThumb } from "./MonThumb";
import { useResultsUi } from "./state";
import type { GameSummary } from "./model";
import s from "./NameEntry.module.css";

const LAST_BUDDY_KEY = "wtp.lastBuddy.v1";

function readLastBuddy(): number {
  try {
    const n = Number(localStorage.getItem(LAST_BUDDY_KEY));
    return BUDDIES.some((b) => b.dex === n) ? n : DEFAULT_BUDDY;
  } catch {
    return DEFAULT_BUDDY;
  }
}

/** "Add your name": a big name field, a random-name button and a buddy to stand next to it. */
export function NameEntry({ summary }: { summary: GameSummary }) {
  const [name, setName] = useState("");
  // Bumps on every letter past NAME_MAX, so the counter shakes instead of the letter silently vanishing.
  const [overflow, setOverflow] = useState(0);
  const [buddy, setBuddy] = useState(readLastBuddy);
  const input = useRef<HTMLInputElement>(null);
  const projector = useSettings((st) => st.projector);
  const narrow = useViewport().w < 600;
  const mon = buddyMon(buddy)!;
  const close = () => useResultsUi.setState({ view: "summary" });

  // Laptops get the cursor straight away. iPads ignore a focus() outside a tap, so the kid taps the field.
  useEffect(() => {
    if (window.matchMedia?.("(pointer: fine)").matches) input.current?.focus({ preventScroll: true });
  }, []);

  const save = () => {
    if (summary.mode === "host") return;
    const typed = name.trim().replace(/\s+/g, " ");
    // Laptop keyboards don't auto-capitalize: "ash ketchum" goes on the board as "Ash Ketchum".
    const finalName = !typed ? randomTrainerName() : typed === typed.toLowerCase() ? typed.replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase()) : typed;
    const entry = leaderboard.add({
      name: finalName,
      buddy,
      mode: summary.mode,
      points: summary.points,
      correct: summary.correct,
      total: summary.rounds.length,
      bestStreak: summary.bestStreak,
      difficulty: summary.config.difficulty,
      categoryId: summary.config.categoryId,
    });
    try {
      localStorage.setItem(LAST_BUDDY_KEY, String(buddy));
    } catch {
      // private mode: the buddy just isn't remembered
    }
    haptic("success");
    useResultsUi.setState({ view: "summary", savedId: entry.id, highlight: { id: entry.id, at: entry.at } });
    useNav.getState().go("leaderboard");
  };

  const type = (value: string) => {
    if ([...value].length > NAME_MAX) {
      setOverflow((n) => n + 1);
      haptic("error");
    }
    setName([...value].slice(0, NAME_MAX).join(""));
  };
  const length = [...name].length;

  const pickBuddy = (dex: number) => {
    setBuddy(dex);
    audio.sfx("select");
    haptic("select");
  };

  // Enter outside the field saves, unless a button has focus (then the button handles it).
  useKeys(
    {
      Enter: (e) => {
        if ((e.target as HTMLElement | null)?.closest?.("button")) return;
        e.preventDefault();
        save();
      },
    },
    { preventDefault: false },
  );

  return (
    <ScreenFrame layout="fill" back={close} title="Add your name!" bodyClassName={s.body}>
      <div className={s.grid}>
        <div className={s.card}>
          <div className={s.stage}>
            <Burst intensity={0.8} />
            <PokeArt key={mon.dex} mon={mon} revealed outline={false} fill={0.82} />
          </div>
          <div className={s.cardText}>
            <Display size="xl" className={s.preview} color={name.trim() ? "var(--hi)" : "var(--ink)"}>
              {name.trim() || "Your name"}
            </Display>
            <p className={s.score}>
              {mon.name} · {summary.mode === "survival" ? `${summary.correct} named` : `${summary.correct}/${summary.asked}`} ·{" "}
              <b>{summary.points.toLocaleString()}</b> pts
            </p>
          </div>
        </div>

        <div className={s.form}>
          <label className={s.field}>
            <span className="wtp-sr-only">Your name</span>
            <input
              ref={input}
              className={s.input}
              value={name}
              onChange={(e) => type(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (window.matchMedia?.("(pointer: fine)").matches) save();
                  else e.currentTarget.blur();
                }
                // The focused field swallows ScreenFrame's Escape, so handle it here.
                if (e.key === "Escape") {
                  e.preventDefault();
                  close();
                }
              }}
              placeholder="Your name"
              autoCapitalize="words"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
              inputMode="text"
              name="trainer-name"
              data-projector={projector || undefined}
            />
            {length > 0 && (
              <span key={overflow} className={s.count} data-full={length >= NAME_MAX || undefined} data-bump={overflow > 0 || undefined} aria-hidden="true">
                {length}/{NAME_MAX}
              </span>
            )}
          </label>
          <Button
            variant="secondary"
            size="md"
            className={s.dice} icon={<span aria-hidden="true">🎲</span>}
            aria-label="Random name"
            onPress={() => setName((n) => randomTrainerName(n))}
          >
            {narrow ? null : "Random"}
          </Button>

          <p className={s.pickLabel}>Pick your buddy!</p>
          <div className={s.buddies} role="radiogroup" aria-label="Buddy">
            {BUDDIES.map((b, i) => (
              <button
                key={b.dex}
                type="button"
                role="radio"
                aria-checked={b.dex === buddy}
                aria-label={b.name}
                className={s.buddy}
                style={{ "--i": i } as CSSProperties}
                onClick={() => pickBuddy(b.dex)}
              >
                <MonThumb mon={b} alt="" />
                {b.dex === buddy && (
                  <span className={s.tick} aria-hidden="true">
                    <IconCheck />
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className={s.actions}>
            <Button variant="ghost" size="md" sfx="back" onPress={close}>
              Skip
            </Button>
            <Button variant="primary" size="md" icon={<IconCheck />} onPress={save} className={s.save}>
              Save!
            </Button>
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
}
