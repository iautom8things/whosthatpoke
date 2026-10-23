import { cx } from "./cx";
import art from "../../data/playQr.svg?inline";
import s from "./PlayQr.module.css";

export interface PlayQrProps {
  /** Accessible name. Omit when a caption next to it says what it opens. */
  title?: string;
  className?: string;
}

/**
 * The play-at-home QR code: Gengar in pop-art dots on a sunburst, quiet zone included (scripts/build-qr.mjs).
 * Inlined into the bundle as an image, so it shows offline and paints once instead of on every frame.
 */
export function PlayQr({ title, className }: PlayQrProps) {
  return <img className={cx(s.qr, className)} src={art} alt={title ?? ""} draggable={false} />;
}
