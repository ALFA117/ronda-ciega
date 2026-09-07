/**
 * The public half of a participant: a handle and a link.
 *
 * These are the only two limits in the program a person can hit by typing
 * ordinary text, and the input was measuring them with the wrong ruler.
 * `join_round` checks `handle.len() <= MAX_HANDLE_LEN`, and `String::len()` in
 * Rust is a count of **bytes**. The form used `maxLength`, which counts UTF-16
 * code units. For ASCII the two agree, which is why this went unnoticed.
 *
 * They stop agreeing the moment anyone writes their own name. "ñ" and every
 * accented vowel cost two bytes; an emoji costs four while spending only two
 * of `maxLength`'s budget. So a thirty-character handle with three accents is
 * thirty-three bytes: the box accepts it, the wallet signs it, and the program
 * refuses it with ProfileTooLong. On a project whose audience writes Spanish,
 * that is not an edge case.
 *
 * The numbers below mirror `MAX_HANDLE_LEN` and `MAX_LINK_LEN` in
 * programs/ronda-ciega/src/state.rs, and scripts/verify.mjs checks that they
 * still agree.
 */

export const MAX_HANDLE_BYTES = 32;
export const MAX_LINK_BYTES = 96;

const encoder = new TextEncoder();

/** What the program will measure, measured the same way. */
export function byteLength(text: string): number {
  return encoder.encode(text).length;
}

export type ProfileError = "handleEmpty" | "handleTooLong" | "linkTooLong" | null;

export function checkProfile(handle: string, link: string): ProfileError {
  const h = handle.trim();
  const l = link.trim();
  if (h.length === 0) return "handleEmpty";
  if (byteLength(h) > MAX_HANDLE_BYTES) return "handleTooLong";
  if (byteLength(l) > MAX_LINK_BYTES) return "linkTooLong";
  return null;
}

/**
 * Trim a string to fit a byte budget without splitting a character in half.
 *
 * Used to cap what the input will accept, so the limit is felt while typing
 * rather than discovered by a wallet prompt. Slicing by byte would cut a
 * multi-byte character down the middle and produce a replacement glyph, which
 * is a worse thing to do to someone's name than refusing the keystroke.
 */
export function truncateToBytes(text: string, maxBytes: number): string {
  if (byteLength(text) <= maxBytes) return text;
  // Iterating the string gives whole code points, so surrogate pairs stay
  // together and an emoji is never half-written.
  let out = "";
  let used = 0;
  for (const ch of text) {
    const size = byteLength(ch);
    if (used + size > maxBytes) break;
    out += ch;
    used += size;
  }
  return out;
}
