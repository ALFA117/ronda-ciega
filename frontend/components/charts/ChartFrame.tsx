"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Table2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { Label, Note } from "../ui";

export interface Series {
  key: string;
  label: string;
  color: string;
}

/**
 * Shared chart shell: title, legend, and a table view.
 *
 * The table is not optional politeness. The chart palette carries a CVD
 * separation in the warn band, which is only legal alongside a secondary
 * encoding — direct labels on the marks and this table are that encoding.
 */
export function ChartFrame({
  title,
  series,
  rows,
  columns,
  empty,
  children,
}: {
  title: string;
  series?: Series[];
  /** Rows for the table view: first cell is the row label. */
  rows?: (string | number)[][];
  columns?: string[];
  empty?: boolean;
  children: React.ReactNode;
}) {
  const t = useT();
  const reduce = useReducedMotion();
  const [asTable, setAsTable] = useState(false);

  return (
    <figure className="space-y-4 rounded-xl border border-edge bg-surface/70 p-5">
      <figcaption className="flex flex-wrap items-start justify-between gap-3">
        <Label>{title}</Label>
        {rows && !empty && (
          <button
            onClick={() => setAsTable((v) => !v)}
            aria-pressed={asTable}
            className="glass inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-xl px-3 font-mono text-2xs text-muted transition-colors hover:text-chalk sm:h-9"
          >
            <Table2 className="h-3 w-3" aria-hidden />
            {t.stats.table}
          </button>
        )}
      </figcaption>

      {series && series.length > 1 && !empty && (
        <ul className="flex flex-wrap gap-4">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ background: s.color }}
                aria-hidden
              />
              <span className="font-mono text-2xs text-muted">{s.label}</span>
            </li>
          ))}
        </ul>
      )}

      {empty ? (
        <Note>{t.stats.empty}</Note>
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          {asTable ? (
            // Switching between the chart and its table moves, it does
            // not fade. Fading in from zero would leave the whole panel
            // invisible if the animation never runs — and the table view
            // exists precisely for readers who cannot rely on the chart.
            <motion.div
              key="table"
              initial={reduce ? undefined : { y: 6 }}
              animate={reduce ? undefined : { y: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-x-auto"
            >
              <table className="w-full font-mono text-2xs">
                <thead>
                  <tr className="text-muted">
                    {columns?.map((c) => (
                      <th key={c} scope="col" className="py-1.5 pr-4 text-left font-normal">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows?.map((r, i) => (
                    <tr key={i} className="border-t border-edge/60">
                      {r.map((cell, j) => (
                        <td key={j} className="tnum py-1.5 pr-4">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </motion.div>
          ) : (
            <motion.div
              key="chart"
              initial={reduce ? undefined : { y: 6 }}
              animate={reduce ? undefined : { y: 0 }}
              transition={{ duration: 0.18 }}
            >
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </figure>
  );
}
