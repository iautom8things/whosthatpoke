import type { CSSProperties } from "react";
import type { Round } from "../../../state/session";
import { IconCheck, IconX } from "../../components";
import { MonThumb } from "./MonThumb";
import s from "./Recap.module.css";

/** Every Pokémon from the game in color, ticked or crossed, with the name under each miss. */
export function Recap({ rounds, show, className }: { rounds: readonly Round[]; show: boolean; className?: string }) {
  return (
    <ol className={`${s.recap} ${className ?? ""}`} data-show={show || undefined} data-count={rounds.length > 10 ? "many" : undefined} aria-label="Your Pokémon">
      {rounds.map((r, i) => {
        const mon = r.question.answer;
        return (
          <li key={`${i}-${mon.dex}`} className={s.tile} data-good={r.correct || undefined} style={{ "--i": i } as CSSProperties}>
            <span className={s.art}>
              <MonThumb mon={mon} alt={`${mon.name}, ${r.correct ? "got it" : "missed"}`} />
              <span className={s.mark} aria-hidden="true">
                {r.correct ? <IconCheck /> : <IconX />}
              </span>
            </span>
            <span className={s.name} aria-hidden={r.correct || undefined}>
              {r.correct ? "" : mon.name}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
