"use client";

import { RefObject, useEffect, useState } from "react";

/**
 * "Has this element been on screen yet?" — measured, not observed.
 *
 * Motion's `whileInView` relies on IntersectionObserver, which was observed to
 * never fire in this app for sections reached by a programmatic scroll: five
 * blocks stayed at opacity 0 with the page sitting right on top of them. A
 * reveal animation that can leave content permanently invisible is worse than
 * no animation, so this measures the rectangle instead, on scroll and on a
 * short poll, and latches true the first time the element is anywhere near the
 * viewport.
 *
 * Latching means the poll stops as soon as it fires, so the cost is a handful
 * of reads during the first seconds of a page's life and nothing after.
 */
export function useOnScreen<T extends HTMLElement>(
  ref: RefObject<T>,
  margin = 60,
): boolean {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (shown) return;

    const check = () => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      // Zero-sized elements are not "off screen", they are not laid out yet.
      if (r.height === 0 && r.width === 0) return;
      if (r.top < window.innerHeight - margin && r.bottom > 0) setShown(true);
    };

    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    const id = window.setInterval(check, 250);

    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
      window.clearInterval(id);
    };
  }, [ref, shown, margin]);

  return shown;
}
