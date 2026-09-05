"use client";

import { Component, ReactNode } from "react";

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
      return (
        this.props.fallback ?? (
          <div
            role="alert"
            className="rounded-xl border border-edge bg-surface/50 p-5 font-mono text-2xs text-muted"
          >
            —
          </div>
        )
      );
    }
    return this.props.children;
  }
}
