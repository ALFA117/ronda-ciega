/**
 * Slot rates, measured in the reader's browser against both chains.
 *
 * The page claims the rollup produces blocks roughly every ten milliseconds
 * while L1 takes hundreds. That is the sort of claim a reader has no way to
 * check, and this project's whole posture is that its numbers are counted
 * rather than asserted — so the two chains are asked, live, and the rate is
 * derived from what they answer rather than typed into the page.
 *
 * Kept separate from the component because the arithmetic has two traps that
 * silently produce a plausible-looking lie: a single sample is not a rate, and
 * a validator that restarts or an RPC behind a load balancer can hand back a
 * slot lower than the previous one.
 */

export interface Sample {
  slot: number;
  /** `performance.now()` at the moment the response arrived. */
  at: number;
}

export const RPC_TIMEOUT_MS = 6000;

/**
 * Slots per second across the whole window, or null when there is not enough
 * to say. Null is the important return: it renders as "measuring", where a 0
 * would render as a measurement claiming the chain had stopped.
 */
export function slotsPerSecond(samples: Sample[]): number | null {
  if (samples.length < 2) return null;

  const first = samples[0];
  const last = samples[samples.length - 1];
  const seconds = (last.at - first.at) / 1000;
  // Two responses inside the same millisecond say nothing about a rate.
  if (seconds < 0.5) return null;

  const slots = last.slot - first.slot;
  // A backwards or flat window means the endpoint moved under us — a restart,
  // or a load balancer with nodes at different heights. Reporting a negative
  // or zero rate would be reporting an artefact of our own sampling as news
  // about the chain.
  if (slots <= 0) return null;

  return slots / seconds;
}

/** Keep the window bounded so an open tab measures recent behaviour, not all day. */
export function trim(samples: Sample[], keep = 12): Sample[] {
  return samples.length > keep ? samples.slice(samples.length - keep) : samples;
}

/**
 * How many times faster the first rate is than the second. Null unless both
 * are real measurements — a ratio against a missing number is not a ratio.
 */
export function ratio(a: number | null, b: number | null): number | null {
  if (a === null || b === null || b <= 0) return null;
  return a / b;
}

/** A slot number with thin spaces every three digits, so 296740510 is readable. */
export function groupDigits(n: number): string {
  return n.toLocaleString("en-US").replace(/,/g, " ");
}

/**
 * One `getSlot`, with a timeout. Devnet RPCs rate-limit and occasionally hang;
 * a request left outstanding forever would freeze the lane on its last value
 * with no indication that it had gone stale.
 */
export async function fetchSlot(url: string): Promise<number> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), RPC_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getSlot",
        params: [{ commitment: "confirmed" }],
      }),
      signal: ctl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error.message ?? "RPC error");
    if (typeof json.result !== "number") throw new Error("no slot in response");
    return json.result;
  } finally {
    clearTimeout(timer);
  }
}
