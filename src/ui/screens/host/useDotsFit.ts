// Host mode's header holds the most: Back, help, the sound button, then Reveal, the hint, Next or a streak pill.
// The progress dots show only while they fit beside all that; otherwise the header shows "5/10".
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

/**
 * True while the dots fit in their header. `title` wraps whichever the header shows, dots or count, at its natural
 * width (width: max-content). After every render this compares the dots' width, remembered from the last render
 * that showed them, with the room the header's side groups leave. Once they miss, the count stays, so the header
 * never flips between the two from one card state to the next. `size` names everything that changes the dots'
 * width (viewport, projector mode); when it changes, the dots show again to be measured, before anything is painted.
 */
export function useDotsFit(title: RefObject<HTMLElement | null>, size: string, enabled: boolean): boolean {
  const [fits, setFits] = useState(true);
  const [, recheck] = useState(0);
  const natural = useRef<{ size: string; width: number } | null>(null);
  const missed = useRef<string | null>(null);

  // Fonts arriving and the side groups changing size need a look too, even without a render here.
  useEffect(() => {
    const header = title.current?.closest("header");
    if (!enabled || !header || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => recheck((n) => n + 1));
    for (const el of [header, ...header.children]) ro.observe(el);
    return () => ro.disconnect();
  }, [enabled, title]);

  useLayoutEffect(() => {
    const el = title.current;
    const header = el?.closest("header");
    if (!enabled || !el || !header) return;
    if (fits) natural.current = { size, width: el.offsetWidth };
    if (natural.current?.size !== size) {
      setFits(true);
      return;
    }
    const [left, , right] = [...header.children] as HTMLElement[];
    const gap = parseFloat(getComputedStyle(header).columnGap) || 0;
    const room = header.clientWidth - left.offsetWidth - right.offsetWidth - 2 * gap;
    if (natural.current.width > room) missed.current = size;
    setFits(missed.current !== size);
  });

  return !enabled || fits;
}
