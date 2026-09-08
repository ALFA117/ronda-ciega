"use client";

import { Component, ReactNode } from "react";
import { useT } from "@/lib/i18n";

/**
 * What a failed section says.
 *
 * The default used to be a box with an em-dash in it, which tells a reader
 * nothing: they cannot tell a panel that broke from a panel that is meant to
 * look like that. Everywhere else this project answers "what happened" in a
 * sentence, and a section that could not render is no exception — especially
 * on a page whose argument is that you should not have to take its word for
 * anything.
 *
 * A function component so it can reach the dictionary; the boundary itself is
 * a class and cannot.
 */
function FailedSection() {
  const t = useT();
  return (
    <div
      role="alert"
      className="rounded-xl border border-edge bg-surface/50 px-5 py-4 text-xs leading-relaxed text-muted"
    >
      {t.common.sectionFailed}
    </div>
  );
}

/**
 * Keeps one broken section from taking the page with it.
 *
 * This matters more here than in a typical app: the round view renders data
 * decoded from on-chain accounts whose layout has already grown once, and a
 * chart that throws on an unexpected shape should cost its own panel, not the
 * whole demo.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    // Visible in the console for debugging; never shown to the viewer raw.
    console.error("section failed:", error);
  }

  render() {
    if (this.state.failed) {
      return this.props.fallback ?? <FailedSection />;
    }
    return this.props.children;
  }
}
