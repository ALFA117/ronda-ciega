"use client";

/**
 * A disclosure that cannot get stuck shut.
 *
 * Two smoother versions of this were tried and both share one failure: the
 * panel's visibility is the animated property. A motion.div going from
 * height 0 to "auto" needs the JavaScript animation loop; the CSS
 * `grid-template-rows: 0fr → 1fr` trick needs the rendering lifecycle. When
 * either is throttled — a background tab, a screen recorder, a browser that
 * has decided the page is not visible — the rows are added to the DOM, the
 * container stays at zero, and the user has pressed a button that did nothing.
 *
 * So nothing here animates open. The content is simply present or absent, the
 * result is instant, and there is no state in which it is half applied. The
 * fade is on the content and starts from visible, so if it never runs the
 * panel is still readable.
 */
export function Collapse({
  open,
  children,
  className = "",
}: {
  open: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  if (!open) return null;
  return <div className={`animate-fade-in ${className}`}>{children}</div>;
}
