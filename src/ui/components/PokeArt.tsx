import { useEffect, useState, type CSSProperties, type SyntheticEvent } from "react";
import { artUrl } from "../../data/catalog";
import type { Mon } from "../../data/types";
import { cx } from "./cx";
import s from "./PokeArt.module.css";

/** Natural aspect (height / width) per art URL, filled by preloadArt and on first load. */
const aspects = new Map<string, number>();
const decoded = new Map<string, Promise<void>>();

function remember(url: string, img: HTMLImageElement) {
  if (img.naturalWidth > 0 && img.naturalHeight > 0) aspects.set(url, img.naturalHeight / img.naturalWidth);
}

function preloadOne(url: string, timeoutMs: number): Promise<void> {
  let job = decoded.get(url);
  if (!job) {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    job = img
      .decode()
      .then(() => remember(url, img))
      .catch(() => {
        decoded.delete(url);
      });
    decoded.set(url, job);
  }
  return Promise.race([job, new Promise<void>((r) => setTimeout(r, timeoutMs))]);
}

/**
 * Fetches and decodes art so the next silhouette appears instantly with no pop-in.
 * Resolves when every image is decoded, failed, or `timeoutMs` passed. Never rejects.
 */
export function preloadArt(mons: readonly Pick<Mon, "art">[], timeoutMs = 4000): Promise<void> {
  return Promise.all(mons.map((m) => preloadOne(artUrl(m), timeoutMs))).then(() => undefined);
}

export interface PokeArtProps {
  mon: Mon;
  /** false = black silhouette, true = full color. Flipping it plays the reveal. */
  revealed: boolean;
  /** Light rim around the silhouette so it reads on dark backgrounds. Default true. */
  outline?: boolean;
  /** Side of the square box (any CSS length). Omit to fill the parent, which needs a definite size. */
  size?: string | number;
  /** Share of the box the art fills, 0..1. Default 0.86. */
  fill?: number;
  /** Fires when the reveal animation ends. */
  onRevealEnd?: () => void;
  className?: string;
  style?: CSSProperties;
}

/** Positions the art so its visible pixels (bbox) are centered and fill `fill` of the square. */
function fitStyle(bbox: Mon["bbox"], aspect: number | undefined, fill: number): CSSProperties | undefined {
  if (!bbox || !aspect) return undefined;
  const [x, y, w, h] = bbox;
  if (w <= 0 || h <= 0) return undefined;
  // In units of the box side: art width W = 1, height = aspect. Content is w x (h * aspect).
  const k = fill / Math.max(w, h * aspect);
  const width = k * 100;
  const height = k * aspect * 100;
  return {
    position: "absolute",
    width: `${width}%`,
    height: `${height}%`,
    left: `${50 - (x + w / 2) * width}%`,
    top: `${50 - (y + h / 2) * height}%`,
    objectFit: "fill",
    padding: 0,
  };
}

/**
 * A Pokémon's art as a silhouette or revealed. The silhouette never exposes the name:
 * its alt is generic and the color layer is aria-hidden until the reveal.
 */
export function PokeArt({ mon, revealed, outline = true, size, fill = 0.86, onRevealEnd, className, style }: PokeArtProps) {
  const url = artUrl(mon);
  const [aspect, setAspect] = useState(() => aspects.get(url));
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(() => aspects.has(url));

  useEffect(() => {
    setAspect(aspects.get(url));
    setLoaded(aspects.has(url));
    setFailed(false);
  }, [url]);

  const fit = fitStyle(mon.bbox, aspect, fill);
  const needsAspect = Boolean(mon.bbox) && !aspect;
  const pad = `${((1 - fill) / 2) * 100}%`;
  const imgStyle: CSSProperties = fit ?? { padding: pad };

  const onLoad = (e: SyntheticEvent<HTMLImageElement>) => {
    remember(url, e.currentTarget);
    setAspect(aspects.get(url));
    setLoaded(true);
  };

  const box: CSSProperties = size !== undefined ? { width: size, height: size } : {};

  return (
    <div
      className={cx(s.root, className)}
      style={{ ...box, ...style }}
      data-revealed={revealed || undefined}
      data-outline={outline || undefined}
      data-ready={(loaded && !needsAspect) || undefined}
    >
      <div className={s.square}>
        <div className={s.pop} onAnimationEnd={(e) => e.animationName.includes("pop") && revealed && onRevealEnd?.()}>
          {failed ? (
            <div className={s.missing} role="img" aria-label={revealed ? mon.name : "Mystery Pokémon"}>
              ?
            </div>
          ) : (
            <>
              <img
                className={s.silhouette}
                src={url}
                alt={revealed ? "" : "Mystery Pokémon silhouette"}
                aria-hidden={revealed || undefined}
                draggable={false}
                decoding="async"
                onLoad={onLoad}
                onError={() => setFailed(true)}
                style={imgStyle}
              />
              <img
                className={s.color}
                src={url}
                alt={revealed ? mon.name : ""}
                aria-hidden={!revealed || undefined}
                draggable={false}
                decoding="async"
                style={imgStyle}
              />
            </>
          )}
        </div>
        <div className={s.flash} aria-hidden="true" />
      </div>
    </div>
  );
}
