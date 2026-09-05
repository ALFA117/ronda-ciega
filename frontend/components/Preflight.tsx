"use client";

import { AlertTriangle } from "lucide-react";
import { usePreflight } from "@/hooks/usePreflight";
import { useT } from "@/lib/i18n";

/**
 * Warns before the action, not after the wallet returns something opaque.
 * Renders nothing when there is nothing wrong — a permanently visible status
 * strip trains people to ignore it.
 */
export function PreflightBanner() {
  const t = useT();
  const { wrongNetwork, lowBalance } = usePreflight();

  if (!wrongNetwork && !lowBalance) return null;

  const message = wrongNetwork ? t.preflight.wrongNetwork : t.preflight.lowBalance;

  return (
    <div
      role="alert"
      className="mb-6 flex items-start gap-3 rounded-xl border border-open/40 bg-open/[0.05] p-4"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-open" aria-hidden />
      <p className="text-xs leading-relaxed text-chalk/85">{message}</p>
    </div>
  );
}
