const PATTERNS = {
  tap: 8,
  select: 14,
  success: [18, 40, 28],
  error: [40, 30, 40],
  swipe: 12,
} as const;

export type HapticName = keyof typeof PATTERNS;

/**
 * Short vibration on phones that support it (Android Chrome). iOS Safari has no vibrate API,
 * so this is a silent no-op there. Never throws.
 */
export function haptic(pattern: HapticName | number | number[] = "tap"): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  const value = typeof pattern === "string" ? PATTERNS[pattern] : pattern;
  try {
    navigator.vibrate(value as number | number[]);
  } catch {
    // Blocked without a user gesture. Fine.
  }
}
