import { AnimatePresence, motion } from "motion/react";
import type { Mon } from "../../../data/types";
import type { Question } from "../../../game/deck";
import { categoryById } from "../../../game/categories";
import { useViewport } from "../../../lib/useViewport";
import { ChoiceButton, Panel, Pill, TypeBadge, type ChoiceState } from "../../components";
import { COPY } from "./copy";
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

/** Pokédex-style card: number, genus, types, region and a kid-friendly fact when we have one. */
export function FactCard({ mon }: { mon: Mon }) {
  const region = categoryById(`region-${mon.region}`).label;
  const badge = useViewport().size === "phone" ? "sm" : "md";
  return (
    <Panel tone="solid" padding="none" className={s.fact} data-has-fact={mon.fact ? true : undefined}>
      <div className={s.factHead}>
        <span className={s.dexNo}>{COPY.dex(mon.dex)}</span>
        {mon.genus && <span className={`wtp-display ${s.genus}`}>{mon.genus}</span>}
      </div>
      <div className={s.factTags}>
        {mon.types.map((t) => (
          <TypeBadge key={t} type={t} size={badge} />
        ))}
        <Pill size={badge} tone="neutral" className={s.region}>
          {region} · {COPY.gen(mon.gen)}
        </Pill>
      </div>
      {mon.fact && <p className={s.factText}>{mon.fact}</p>}
    </Panel>
  );
}
