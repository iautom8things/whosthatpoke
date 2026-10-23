import type { CSSProperties } from "react";
import { cx, PlayQr } from "../../components";
import s from "./PlayAtHome.module.css";

/**
 * "Play at home!" sticker with the QR code for the public game URL, so families can keep playing after the party.
 * Set --qr on the className for the code's width.
 */
export function PlayAtHome({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <figure className={cx(s.card, className)} style={style}>
      <PlayQr title="QR code to play Who’s That Pokémon? at home" className={s.qr} />
      <figcaption className={cx("wtp-display", s.label)}>
        Play at home!
      </figcaption>
    </figure>
  );
}
