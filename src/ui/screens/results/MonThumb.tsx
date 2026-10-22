import { useState, type CSSProperties } from "react";
import { artUrl } from "../../../data/catalog";
import type { Mon } from "../../../data/types";
import s from "./MonThumb.module.css";

/** Small full-color art for recaps, buddy pickers and leaderboard rows. Fills its positioned parent. */
export function MonThumb({ mon, alt, className, style }: { mon: Mon; alt?: string; className?: string; style?: CSSProperties }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={`${s.thumb} ${className ?? ""}`} style={style}>
      {failed ? (
        <span className={s.missing} role="img" aria-label={alt ?? mon.name}>
          ?
        </span>
      ) : (
        <img src={artUrl(mon)} alt={alt ?? mon.name} draggable={false} decoding="async" onError={() => setFailed(true)} />
      )}
    </span>
  );
}
