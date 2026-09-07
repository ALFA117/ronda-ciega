"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { formatCountdown } from "@/lib/duration";

/**
 * How long the round has left, as a bar that actually drains.
 *
 * The window is measured from first render rather than from the round's
 * creation, because the round account does not store when it opened — only
 * when it closes. So the bar shows the share of *the time you have been
 * watching* that remains, which is honest about what it knows.
 */
export function Deadline({ deadlineTs }: { deadlineTs: number }) {
  const t = useT();
  const [now, setNow] = useState(() => Date.now() / 1000);
  const [start] = useState(() => Date.now() / 1000);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(id);
  }, []);

  const left = Math.max(0, deadlineTs - now);
  const span = Math.max(1, deadlineTs - start);
  const pct = Math.min(100, Math.max(0, (left / span) * 100));

  if (left <= 0) {
    return (
      <span className="font-mono text-2xs text-muted">{t.round.closed}</span>
    );
  }

  return (
    <div className="flex items-center gap-2.5">
      <span className="tnum font-mono text-2xs text-muted">
        {t.round.deadline} {formatCountdown(left)}
      </span>
      <div
        className="h-1 w-20 overflow-hidden rounded-full bg-edge"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t.round.deadline}
      >
        <div
          className="h-full rounded-full bg-open transition-[width] duration-1000 ease-linear"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
