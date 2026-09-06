"use client";

import { useEffect, useState } from "react";

/**
 * Which section the reader is currently in.
 *
 * Measured on scroll rather than observed, for the same reason the reveal hook
 * is: IntersectionObserver was unreliable here, and orientation is not
 * something to leave to a callback that might not fire. The section whose top
 * has most recently passed the reading line wins.
 */
export function useActiveSection(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const check = () => {
      // A third of the way down is where the eye actually sits while reading.
      const line = window.innerHeight * 0.34;
      let current: string | null = null;
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= line) current = id;
      }
      setActive(current);
    };

    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    // Scroll events are not guaranteed. A page that is not being painted —
    // a background tab, an embedded frame — dispatches none at all, and then
    // the reader's position silently stops updating. A slow poll costs one
    // rectangle read every 400ms and removes that whole class of failure.
    const id = window.setInterval(check, 400);
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
      window.clearInterval(id);
    };
  }, [ids]);

  return active;
}
