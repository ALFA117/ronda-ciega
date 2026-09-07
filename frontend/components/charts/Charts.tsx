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

  // Round 0 is the state before anyone proposes: nobody is paired. It is not
  // in `history` because the program records a frame per tick, but leaving it
  // out makes the chart open mid-story — the first bar is already half full
  // and the climb from nothing is the thing worth seeing.
  const data =
    frames.length > 0
      ? [
          { tick: 0, matched: 0, unmatched: total },
          ...frames.map((pairs, i) => {
            const matched = pairs.slice(0, total).filter((v) => v !== NONE).length;
            return { tick: i + 1, matched, unmatched: total - matched };
          }),
        ]
      : [];

  const empty = data.length === 0 || total === 0;

  // Drawn at the aspect it is displayed at. The previous version stretched a
  // 100-unit box across the full column width with preserveAspectRatio="none",
  // which scaled the glyphs and the corner radii horizontally by about five —
  // that distortion was the whole reason the labels looked wrong.
  const PAD_L = 26;
  const PAD_R = 8;
  // Room above the tallest bar for its value label, which sits outside it.
  const PAD_T = 24;
  const PAD_B = 22;
  const W = 320;
  const H = 178;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const band = empty ? 0 : plotW / data.length;
  const barW = Math.min(band * 0.56, 26);
  const y = (v: number) => PAD_T + plotH - (total ? (v / total) * plotH : 0);

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
        className="w-full"
        style={{ aspectRatio: `${W} / ${H}` }}
        role="img"
        aria-label={`${t.stats.convergence}: ${data
          .map((d) => `${t.stats.tick} ${d.tick} ${d.matched}/${total}`)
          .join(", ")}`}
      >
        {/* Two gridlines, and each names a value the chart actually reaches:
            zero, and the whole cohort. The top one is what the bars converge
            on, so it is the line that carries the meaning. */}
        {[0, total].map((v) => (
          <g key={v}>
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={y(v)}
              y2={y(v)}
              stroke="var(--edge)"
              strokeWidth={v === total ? 1 : 1}
              strokeDasharray={v === total ? "3 3" : undefined}
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={PAD_L - 7}
              y={y(v) + 3.5}
              textAnchor="end"
              className="fill-[var(--text-dim)] font-mono"
              style={{ fontSize: 9 }}
            >
              {v}
            </text>
          </g>
        ))}

        {data.map((d, i) => {
          const x = PAD_L + i * band + (band - barW) / 2;
          const hM = total ? (d.matched / total) * plotH : 0;
          const hU = total ? (d.unmatched / total) * plotH : 0;
          return (
            // The bars are drawn at their real height and the group slides in.
            //
            // They used to grow from `height: 0`, which makes the animation
            // load-bearing: a tab that is not compositing never runs it, and
            // the chart renders its axes, its tick labels and its direct value
            // labels around bars of no height at all. Not blank — worse than
            // blank, because the numbers are still printed beside nothing. The
            // same rule the entrance variants follow: motion is something this
            // page is allowed to lose.
            <motion.g
              key={d.tick}
              initial={reduce ? undefined : { y: 10 }}
              animate={reduce ? undefined : { y: 0 }}
              transition={{ duration: 0.45, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
            >
              {hU > 0 && (
                <rect
                  x={x}
                  width={barW}
                  y={y(total)}
                  height={Math.max(hU - GAP, 0)}
                  rx={2}
                  fill={C2}
                />
              )}
              {hM > 0 && (
                <rect x={x} width={barW} y={y(d.matched)} height={hM} rx={2} fill={C1} />
              )}
              {/* The round number, on the axis. */}
              <text
                x={x + barW / 2}
                y={H - PAD_B + 14}
                textAnchor="middle"
                className="fill-[var(--text-dim)] font-mono"
                style={{ fontSize: 9 }}
              >
                {d.tick}
              </text>
              {/* Direct value label — the secondary encoding the palette
                  requires, and what makes the last two bars distinguishable
                  when they are the same height. */}
              <text
                x={x + barW / 2}
                y={y(d.matched) - 5}
                textAnchor="middle"
                className="fill-[var(--text)] font-mono"
                style={{ fontSize: 9.5, fontWeight: 500 }}
              >
                {d.matched}
              </text>
            </motion.g>
          );
        })}
      </svg>

      <p className="mt-1 font-mono text-2xs text-dim">{t.stats.convergenceNote}</p>
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
            {/* The width is the measurement, so it is set in CSS and is
                right whether or not a frame is ever drawn. The bar arrives by
                sliding; a stalled animation leaves it in place at the correct
                length instead of at zero. */}
            <div className="h-2.5 w-full overflow-hidden rounded-sm bg-surface2">
              <motion.div
                className="h-full rounded-sm"
                style={{ background: b.color, width: `${(b.value / max) * 100}%` }}
                initial={reduce ? undefined : { x: -12 }}
                animate={reduce || shown ? { x: 0 } : undefined}
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

