"use client";

import { usePathname } from "next/navigation";

/**
 * The room the page sits in.
 *
 * This used to be a canvas tunnel of hexagonal rings with parallax and
 * spinning 3D seals. It was the loudest thing on every screen and said
 * "template" before the headline said anything. What is left is the paper
 * itself and a faint ruled grid under the first screen — a ledger page —
 * shorter still on the working screens. Static, no loop, nothing to pause.
 */
export function AmbientBackground() {
  const pathname = usePathname();
  const full = pathname === "/";
  return (
    <div aria-hidden className={`amb-root ${full ? "amb-full" : "amb-calm"}`}>
      <div className="amb-grid" />
    </div>
  );
}
