const holds = new WeakMap<object, number>();

/**
 * Makes `el` inert until every returned release function has run, so two stacked Modals keep the
 * app behind them inert until both close. Calling a release twice is harmless.
 */
export function holdInert(el: { inert: boolean }): () => void {
  holds.set(el, (holds.get(el) ?? 0) + 1);
  el.inert = true;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    const left = Math.max(0, (holds.get(el) ?? 1) - 1);
    holds.set(el, left);
    if (left === 0) el.inert = false;
  };
}
