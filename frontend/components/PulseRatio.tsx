"use client";

import { useSyncExternalStore } from "react";
import { readRatio, subscribeRatio } from "@/lib/pulse";
import { useT } from "@/lib/i18n";

/**
 * How much faster the rollup is, in the hero, measured while you read it.
 *
 * The page's speed claim used to appear a screen and a half down, in a table.
 * This is the same figure in the first thing anybody sees — and it is the
 * reader's own measurement, not mine, which is the whole difference between
 * this line and a marketing number.
 *
 * It polls nothing. The band below owns the one poller and publishes what it
 * finds; this subscribes. Before the first two samples land there is no figure
 * to show and it renders nothing, because a hero that reserves space for a
 * number it does not have is a hero with a hole in it.
 */
export function PulseRatio() {
  const t = useT();
  const ratio = useSyncExternalStore(
    subscribeRatio,
    readRatio,
    // The server has measured nothing, and neither has the first client paint.
    () => null,
  );

  if (ratio === null) return null;

  return (
    <span className="inline-flex items-baseline gap-1.5 font-mono text-2xs text-muted">
      <span className="tnum text-sealed">{ratio.toFixed(1)}×</span>
      {t.pulse.heroLine}
    </span>
  );
}
