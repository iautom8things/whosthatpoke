const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** "just now", "5 min ago", "2 hr ago", "yesterday", "3 days ago", then a date. */
export function timeAgo(at: number, now = Date.now()): string {
  const d = Math.max(0, now - at);
  if (d < MIN) return "just now";
  if (d < HOUR) return `${Math.floor(d / MIN)} min ago`;
  if (d < DAY) return `${Math.floor(d / HOUR)} hr ago`;
  if (d < 2 * DAY) return "yesterday";
  if (d < 7 * DAY) return `${Math.floor(d / DAY)} days ago`;
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
