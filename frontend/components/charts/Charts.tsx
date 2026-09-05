"use client";

import { useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useT } from "@/lib/i18n";
import { NONE } from "@/lib/constants";
import { framesFor, RoundAccount } from "@/lib/program";
import { ChartFrame } from "./ChartFrame";
import { useOnScreen } from "@/hooks/useOnScreen";

const C1 = "var(--chart-1)";
const C2 = "var(--chart-2)";
/** A 2px gap of surface between adjacent fills, per the mark spec. */
const GAP = 2;

/**
 * Matched vs unmatched across the algorithm's rounds, from the round's own
 * recorded history. Stacked because the two parts sum to a constant — the
 * question is how the whole splits, not how each moves independently.
 */
export function ConvergenceChart({ round }: { round: RoundAccount }) {
  const t = useT();
  const reduce = useReducedMotion();

  const frames = round.transparent ? framesFor(round) : [];
  const total = round.founderCount;
  const data = frames.map((pairs, i) => {
    const matched = pairs.slice(0, total).filter((v) => v !== NONE).length;
    return { tick: i + 1, matched, unmatched: total - matched };
  });

  const empty = data.length === 0 || total === 0;

  const W = 100;
  const H = 132;
  const band = empty ? 0 : W / data.length;
  const barW = Math.min(band * 0.62, 14);

  return (
    <ChartFrame
      title={t.stats.convergence}
      empty={empty}
      series={[
        { key: "m", label: t.stats.matched, color: C1 },
        { key: "u", label: t.stats.unmatched, color: C2 },
      ]}
      columns={[t.stats.tick, t.stats.matched, t.stats.unmatched]}
      rows={data.map((d) => [d.tick, d.matched, d.unmatched])}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-36 w-full"
        role="img"
        aria-label={`${t.stats.convergence}: ${data
          .map((d) => `${t.stats.tick} ${d.tick} ${d.matched}/${total}`)
          .join(", ")}`}
      >
        {/* Recessive baseline. No gridlines: four bars do not need them. */}
        <line
          x1="0"
          x2={W}
          y1={H - 18}
          y2={H - 18}
          stroke="var(--edge)"
          strokeWidth={0.5}
          vectorEffect="non-scaling-stroke"
        />
        {data.map((d, i) => {
          const x = i * band + (band - barW) / 2;
          const plot = H - 26;
          const hM = total ? (d.matched / total) * plot : 0;
          const hU = total ? (d.unmatched / total) * plot : 0;
          return (
            <g key={d.tick}>
              {hU > 0 && (
                <motion.rect
                  x={x}
                  width={barW}
                  y={H - 18 - hU - hM - GAP}
                  rx={2}
                  fill={C2}
                  initial={reduce ? undefined : { height: 0 }}
                  animate={{ height: Math.max(hU - GAP, 0) }}
                  transition={{ duration: 0.5, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                />
              )}
              <motion.rect
                x={x}
                width={barW}
                y={H - 18 - hM}
                rx={2}
                fill={C1}
                initial={reduce ? undefined : { height: 0 }}
                animate={{ height: hM }}
                transition={{ duration: 0.5, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
              />
              {/* Direct label — the secondary encoding the palette requires. */}
              <text
                x={x + barW / 2}
                y={H - 6}
                textAnchor="middle"
                className="fill-[var(--text-muted)] font-mono"
                style={{ fontSize: 7 }}
              >
                {d.tick}
              </text>
              <text
                x={x + barW / 2}
                y={H - 22 - hM}
                textAnchor="middle"
                className="fill-[var(--text)] font-mono"
                style={{ fontSize: 7 }}
              >
                {d.matched}
              </text>
            </g>
          );
        })}
      </svg>
    </ChartFrame>
  );
}

/**
 * The latency claim, as two bars.
 *
 * Measured against devnet from Mexico: the per-round mode pays a network
 * round-trip per tick, the batched mode pays one. Both numbers come from real
 * runs and are labeled as such, because a made-up benchmark is worse than none.
 */
export function LatencyChart({
  oneTxMs = 671,
  perTickMs = 4090,
  ticks = 3,
}: {
  oneTxMs?: number;
  perTickMs?: number;
  ticks?: number;
}) {
  const t = useT();
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const shown = useOnScreen(ref);
  const max = Math.max(oneTxMs, perTickMs);

  const bars = [
    { label: t.stats.latencyOneTx, value: oneTxMs, color: C1 },
    { label: `${t.stats.latencyPerTick} (${ticks})`, value: perTickMs, color: C2 },
  ];

  return (
    <ChartFrame
      title={t.stats.latency}
      columns={["", "ms"]}
      rows={bars.map((b) => [b.label, b.value])}
    >
      <div ref={ref} className="space-y-4">
        {bars.map((b, i) => (
          <div key={b.label} className="space-y-1.5">
            <div className="flex items-baseline justify-between font-mono text-2xs">
              <span className="text-muted">{b.label}</span>
              <span className="tnum text-chalk">{b.value} ms</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-sm bg-surface2">
              <motion.div
                className="h-full rounded-sm"
                style={{ background: b.color }}
                initial={reduce ? undefined : { width: 0 }}
                animate={
                  reduce || shown ? { width: `${(b.value / max) * 100}%` } : undefined
                }
                transition={{ duration: 0.7, delay: i * 0.12, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
          </div>
        ))}
        <p className="text-xs text-muted">{t.stats.latencyNote}</p>
      </div>
    </ChartFrame>
  );
}

