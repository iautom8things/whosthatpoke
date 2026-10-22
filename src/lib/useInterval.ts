import { useEffect, useRef } from "react";

/** Calls `callback` every `ms`. Pass null to pause. The latest callback always runs. */
export function useInterval(callback: () => void, ms: number | null): void {
  const saved = useRef(callback);
  saved.current = callback;

  useEffect(() => {
    if (ms === null) return;
    const id = window.setInterval(() => saved.current(), ms);
    return () => window.clearInterval(id);
  }, [ms]);
}
