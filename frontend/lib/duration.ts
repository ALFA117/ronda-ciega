/**
 * Round windows: what a person is allowed to type, and how it reads back.
 *
 * The "closes in" box was a bare `type="number"` whose value went through
 * `Number()` straight into the deadline. Three ways that ends badly, all of
 * them silent:
 *
 *   - Clearing the box gives `Number("") === 0`, so the deadline is *now*.
 *   - Typing anything non-numeric gives `NaN`, and `new BN(NaN).toString()`
 *     is `"0"` — not a throw, not a warning, a deadline in 1970.
 *   - `min={1}` on the input stops the spinner and nothing else.
 *
 * In every case the round is created successfully and is already past its
 * deadline, so nobody can join it and nothing explains why. `min` on an input
 * is a hint to the widget; this is the check.
 */

/** A round shorter than this cannot realistically be joined. */
export const MIN_MINUTES = 1;

/** Fourteen days. Long enough for any real round, short enough to be a typo. */
export const MAX_MINUTES = 20_160;

export type MinutesError = "empty" | "notNumber" | "tooShort" | "tooLong" | null;

/**
 * Validate the raw string from the input. Deliberately takes the string, not a
 * number: by the time it is a number the empty case has already become 0 and
 * the garbage case has already become NaN, and those are the two that matter.
 */
export function checkMinutes(raw: string): MinutesError {
  const trimmed = raw.trim();
  if (trimmed === "") return "empty";
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return "notNumber";
  // A fractional minute is not an error, it is a deadline; only the bounds are.
  if (n < MIN_MINUTES) return "tooShort";
  if (n > MAX_MINUTES) return "tooLong";
  return null;
}

/** The value to send, once `checkMinutes` has said there is one. */
export function minutesToSeconds(raw: string): number {
  return Math.round(Number(raw.trim()) * 60);
}

/**
 * A countdown a person can read.
 *
 * The old one printed `m:ss` from `floor(left / 60)`, so a one-day round
 * counted down from "1440:00" — a number nobody parses as a day. Above an
 * hour the seconds stop being information anyway, so the units change with
 * the magnitude.
 */
export function formatCountdown(secondsLeft: number): string {
  const left = Math.max(0, Math.floor(secondsLeft));

  const days = Math.floor(left / 86_400);
  const hours = Math.floor((left % 86_400) / 3_600);
  const minutes = Math.floor((left % 3_600) / 60);
  const seconds = left % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
