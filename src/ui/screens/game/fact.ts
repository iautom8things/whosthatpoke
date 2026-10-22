// How the fact card fits a fact: the cuts and text sizes FactCard (Answers.tsx) tries, best first.

/** A fact's sentences. A piece that doesn't open like a sentence ("...which it forgets") stays with the one before. */
export function sentences(text: string): string[] {
  const out: string[] = [];
  for (const piece of text.match(/[^.!?…]+(?:[.!?…]+["”’)]*|$)\s*/g) ?? [text]) {
    if (out.length > 0 && !/^["“‘'(]*\p{Lu}/u.test(piece)) out[out.length - 1] += piece;
    else out.push(piece);
  }
  return out.map((p) => p.trim()).filter(Boolean);
}

/** Text sizes tried for each cut of the fact, as a share of the CSS size. The last cut also gets the smallest. */
const FIT_SCALES = [1, 0.86];
const LAST_SCALE = 0.74;

export interface FitOption {
  text: string;
  scale: number;
  /** Hide the type badges and region chip to make room. */
  tight: boolean;
}

/**
 * The whole fact with the badges, then without them at each of the FIT_SCALES, then the leading whole sentences
 * the same way. It never stops mid-sentence: the last resort is the first sentence at LAST_SCALE.
 */
export function fitOptions(fact: string | undefined): FitOption[] {
  const parts = fact ? sentences(fact) : [];
  const out: FitOption[] = [];
  parts.forEach((_, cut) => {
    const text = parts.slice(0, parts.length - cut).join(" ");
    if (cut === 0) out.push({ text, scale: 1, tight: false });
    for (const scale of FIT_SCALES) out.push({ text, scale, tight: true });
  });
  if (parts.length > 0) out.push({ text: parts[0], scale: LAST_SCALE, tight: true });
  return out;
}
