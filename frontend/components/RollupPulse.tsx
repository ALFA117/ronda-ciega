"use client";

import { useEffect, useRef, useState } from "react";
import { DEVNET_RPC, TEE_RPC } from "@/lib/constants";
import {
  fetchSlot,
  publishRatio,
  groupDigits,
  ratio,
  slotsPerSecond,
  trim,
  type Sample,
} from "@/lib/pulse";
import { useOnScreen } from "@/hooks/useOnScreen";
import { useT } from "@/lib/i18n";
import { Label } from "./ui";

/**
 * Both chains, counting, live, in the reader's own browser.
 *
 * The page's speed argument was two rows of a table and a paragraph about
 * network latency — a claim the reader had to take on trust, on a page whose
 * entire posture is that it does not ask for trust. This asks both endpoints
 * for their slot height twice a second and derives the rate from the answers.
 * The rollup runs a few times faster than L1 and you can watch it happen; no
 * wallet, no transaction, nothing to read.
 *
 * It is also the cheapest honesty check in the project. If the TEE endpoint is
 * down, this lane says so, in front of everyone, instead of the page carrying
 * on claiming 671 ms.
 */

/**
 * Devnet round-trips run 300-900 ms from here, so a shorter period than this
 * would start a request before the previous one answered. The in-flight guard
 * below is what actually enforces it; this just keeps the guard from having to
 * drop most of what it is asked to do.
 */
const PERIOD_MS = 900;

interface Lane {
  samples: Sample[];
  /** Consecutive failures. A public devnet RPC drops the occasional request. */
  misses: number;
}

const EMPTY: Lane = { samples: [], misses: 0 };

/**
 * How many consecutive failures before a lane admits it is down.
 *
 * One dropped request out of a public RPC is normal and saying "no answer"
 * about it would make a working page look broken twice a minute. Three in a
 * row at half-second intervals is an outage.
 */
const MISSES_BEFORE_DOWN = 3;

const isDown = (lane: Lane) => lane.misses >= MISSES_BEFORE_DOWN;

/**
 * `bare` drops the panel chrome so this can sit inside the measured band.
 *
 * Four figures measured once and written down, then two measured now — they
 * are the same argument and they were two separate strips with a gap between
 * them, 438 pixels of the page saying "here are some numbers" twice. Inside
 * one frame the live pair reads as what it is: the part of the claim the
 * reader does not have to take on trust.
 */
export function RollupPulse({ bare = false }: { bare?: boolean } = {}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  // Negative margin, and the sign is the whole point: useOnScreen tests
  // `top < innerHeight - margin`, so a positive margin SHRINKS the trigger
  // area and a negative one extends it past the fold. Six hundred the wrong way
  // round made this start later, not sooner.
  //
  // Sooner matters because the hero states this measurement and cannot state
  // it before the poller has run. Waiting for the band to be strictly visible
  // meant the headline figure only ever appeared to someone who scrolled past
  // it and came back. This starts while the band is still below the fold —
  // within a second of load on a normal viewport — and still starts nothing
  // for a reader who never leaves the hero.
  const shown = useOnScreen(ref, -600);

  const [rollup, setRollup] = useState<Lane>(EMPTY);
  const [l1, setL1] = useState<Lane>(EMPTY);

  useEffect(() => {
    if (!shown) return;
    let live = true;
    const inFlight = new Set<string>();

    const poll = async (
      url: string,
      set: React.Dispatch<React.SetStateAction<Lane>>,
    ) => {
      // One request per endpoint at a time. Without this a slow lane queues
      // requests faster than it answers them, and the samples arrive in an
      // order that has nothing to do with when they were asked for — which is
      // a rate computed from timestamps that no longer mean anything.
      if (inFlight.has(url)) return;
      // A hidden tab throttles timers and would leave a gap that reads as a
      // slower chain rather than as a paused measurement. Skipping the sample
      // keeps the window honest.
      if (document.visibilityState !== "visible") return;
      inFlight.add(url);
      try {
        const slot = await fetchSlot(url);
        if (!live) return;
        set((prev) => ({
          misses: 0,
          samples: trim([...prev.samples, { slot, at: performance.now() }]),
        }));
      } catch {
        if (!live) return;
        set((prev) => {
          const misses = prev.misses + 1;
          // Once a lane is genuinely down its samples go too. A gap spanning
          // an outage would otherwise average into the rate as if the chain
          // had been slow, rather than unreachable — the measurement would
          // survive the thing that invalidated it.
          return {
            misses,
            samples: misses >= MISSES_BEFORE_DOWN ? [] : prev.samples,
          };
        });
      } finally {
        inFlight.delete(url);
      }
    };

    const run = () => {
      void poll(TEE_RPC, setRollup);
      void poll(DEVNET_RPC, setL1);
    };

    run();
    const id = window.setInterval(run, PERIOD_MS);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [shown]);

  const rollupRate = slotsPerSecond(rollup.samples);
  const l1Rate = slotsPerSecond(l1.samples);
  const times = ratio(rollupRate, l1Rate);

  // Published so the hero can say the same number without polling for it.
  useEffect(() => {
    publishRatio(times);
  }, [times]);

  // The bars are scaled against whichever lane is currently faster, so the
  // slower one is always a readable fraction rather than a sliver.
  const peak = Math.max(rollupRate ?? 0, l1Rate ?? 0, 1);

  const ratioLine =
    times !== null ? (
      <>
        <span className="tnum text-sealed">{times.toFixed(1)}×</span>{" "}
        {t.pulse.faster}
      </>
    ) : (
      t.pulse.measuring
    );

  if (bare) {
    return (
      <div ref={ref}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-1 pt-5 sm:px-7">
          <Label>{t.pulse.title}</Label>
          <span className="font-mono text-2xs text-muted">{ratioLine}</span>
        </div>
        <div className="sm:px-2">
          <PulseLane
            name={t.pulse.rollup}
            host={t.pulse.rollupHost}
            lane={rollup}
            rate={rollupRate}
            peak={peak}
            tone="sealed"
          />
          <PulseLane
            name={t.pulse.l1}
            host={t.pulse.l1Host}
            lane={l1}
            rate={l1Rate}
            peak={peak}
            tone="open"
          />
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className="glass overflow-hidden rounded-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge px-5 py-3.5">
        <Label>{t.pulse.title}</Label>
        <span className="font-mono text-2xs text-muted">{ratioLine}</span>
      </div>

      <div className="divide-y divide-edge">
        <PulseLane
          name={t.pulse.rollup}
          host={t.pulse.rollupHost}
          lane={rollup}
          rate={rollupRate}
          peak={peak}
          tone="sealed"
        />
        <PulseLane
          name={t.pulse.l1}
          host={t.pulse.l1Host}
          lane={l1}
          rate={l1Rate}
          peak={peak}
          tone="open"
        />
      </div>

      <p className="border-t border-edge px-5 py-3 font-mono text-2xs leading-relaxed text-dim">
        {t.pulse.note}
      </p>
    </div>
  );
}

function PulseLane({
  name,
  host,
  lane,
  rate,
  peak,
  tone,
}: {
  name: string;
  host: string;
  lane: Lane;
  rate: number | null;
  peak: number;
  tone: "sealed" | "open";
}) {
  const t = useT();
  const last = lane.samples[lane.samples.length - 1];
  const colour = tone === "sealed" ? "text-sealed" : "text-open";
  const fill = tone === "sealed" ? "bg-sealed" : "bg-open";

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex items-baseline gap-2.5">
          <span className="font-mono text-xs text-chalk">{name}</span>
          <span className="font-mono text-2xs text-dim">{host}</span>
        </div>
        <span className={`tnum font-mono text-lg leading-none ${colour}`}>
          {isDown(lane) ? "—" : last ? groupDigits(last.slot) : "…"}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-3">
        {/* The bar is decoration; the number beside it is the measurement, and
            it is never drawn from a rate we do not have. */}
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-edge">
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${fill}`}
            style={{ width: rate === null ? "0%" : `${(rate / peak) * 100}%` }}
          />
        </div>
        <span className="tnum shrink-0 font-mono text-2xs text-muted">
          {isDown(lane) ? (
            <span className="text-open">{t.pulse.unreachable}</span>
          ) : rate === null ? (
            t.pulse.measuring
          ) : (
            <>
              {rate.toFixed(1)} {t.pulse.perSecond}
            </>
          )}
        </span>
      </div>
    </div>
  );
}
