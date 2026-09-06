/**
 * Subsequence match, so "cmrv" finds "commit-reveal".
 *
 * Lives here rather than inside the palette component so it can be tested
 * without rendering React: it is the one piece of the palette with real
 * behaviour to get wrong.
 */
export function matches(haystack: string, needle: string): boolean {
  if (!needle) return true;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  let i = 0;
  for (const ch of h) {
    if (ch === n[i]) i++;
    if (i === n.length) return true;
  }
  return false;
}
