import { AnimatePresence, motion } from "motion/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Mon } from "../../../data/types";
import type { Question } from "../../../game/deck";
import { categoryById } from "../../../game/categories";
import { useViewport } from "../../../lib/useViewport";
import { ChoiceButton, Panel, Pill, TypeBadge, type ChoiceState } from "../../components";
import { COPY } from "./copy";
import { fitOptions, type FitOption } from "./fact";
import s from "./game.module.css";

export interface AnswersProps {
  question: Question;
  /** Choices take presses. */
  live: boolean;
  revealed: boolean;
  picked: number | null;
  /** Second beat of the reveal: the fact card replaces the buttons. */
  factShown: boolean;
  onPick: (dex: number) => void;
}

function stateOf(mon: Mon, answer: Mon, picked: number | null, revealed: boolean): ChoiceState {
  if (!revealed) return mon.dex === picked ? "picked" : "idle";
  if (mon.dex === answer.dex) return "correct";
  if (mon.dex === picked) return "wrong";
  return "dimmed";
}

/** The 2x2 answer grid. On the second beat of the reveal a fact card takes its exact spot. */
export function Answers({ question, live, revealed, picked, factShown, onPick }: AnswersProps) {
  const { answer, choices } = question;
  return (
    <div className={s.answers} data-fact={factShown || undefined}>
      <div className={s.grid} key={question.index} aria-hidden={factShown || undefined}>
        {choices.map((mon, i) => (
          <motion.div
            key={mon.dex}
            className={s.cell}
            initial={{ opacity: 0, y: 26, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 520, damping: 24, delay: 0.25 + i * 0.07 }}
          >
            <ChoiceButton
              label={mon.name}
              hint={i + 1}
              state={stateOf(mon, answer, picked, revealed)}
              disabled={!live}
              onPress={() => onPick(mon.dex)}
            />
          </motion.div>
        ))}
      </div>
      <AnimatePresence>
        {factShown && (
          <motion.div
            key={`fact-${question.index}`}
            className={s.factWrap}
            initial={{ opacity: 0, scale: 0.85, rotateX: -50 }}
            animate={{ opacity: 1, scale: 1, rotateX: 0, transition: { type: "spring", stiffness: 380, damping: 24 } }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
          >
            <FactCard mon={answer} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Fits the fact to its card: the first of fitOptions() that fits. Only a single sentence too long for the card
 * ends in "…". Each try is a re-render inside the layout phase, so none gets painted.
 */
function useFittedFact(fact: string | undefined) {
  const options = useMemo(() => fitOptions(fact), [fact]);
  const [at, setAt] = useState(0);
  const ref = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    const p = ref.current;
    const card = p?.parentElement;
    if (!p || !card || at >= options.length - 1) return;
    if (p.scrollHeight > p.clientHeight + 1 || card.scrollHeight > card.clientHeight + 1) setAt(at + 1);
  });

  // Fit again from the top when the card changes size (rotation, resize) or the web font arrives.
  useEffect(() => {
    const card = ref.current?.parentElement;
    if (!card) return;
    let alive = true;
    if (document.fonts && document.fonts.status !== "loaded") void document.fonts.ready.then(() => alive && setAt(0));
    if (typeof ResizeObserver === "undefined") return () => void (alive = false);
    let size = `${card.clientWidth}x${card.clientHeight}`;
    const ro = new ResizeObserver(() => {
      const next = `${card.clientWidth}x${card.clientHeight}`;
      if (next === size) return;
      size = next;
      setAt(0);
    });
    ro.observe(card);
    return () => {
      alive = false;
      ro.disconnect();
    };
  }, []);

  const shown: FitOption = options[Math.min(at, options.length - 1)] ?? { text: fact ?? "", scale: 1, tight: false };
  return { ref, ...shown };
}

/** Pokédex-style card: number, genus, types, region and a kid-friendly fact when we have one. */
export function FactCard({ mon }: { mon: Mon }) {
  const region = mon.place ?? categoryById(`region-${mon.region}`).label;
  const badge = useViewport().size === "phone" ? "sm" : "md";
  const fact = useFittedFact(mon.fact);
  return (
    <Panel tone="solid" padding="none" className={s.fact} data-has-fact={mon.fact ? true : undefined} data-tight={fact.tight || undefined}>
      <div className={s.factHead}>
        <span className={s.dexNo}>{COPY.dex(mon.dex)}</span>
        {mon.genus && <span className={`wtp-display wtp-surface-title ${s.genus}`}>{mon.genus}</span>}
      </div>
      <div className={s.factTags}>
        {mon.types.map((t) => (
          <TypeBadge key={t} type={t} size={badge} />
        ))}
        <Pill size={badge} tone="neutral" className={s.region}>
          {region} · {COPY.gen(mon.gen)}
        </Pill>
      </div>
      {mon.fact && (
        <p ref={fact.ref} className={s.factText} style={{ "--fit": fact.scale } as CSSProperties}>
          {fact.text}
        </p>
      )}
    </Panel>
  );
}
