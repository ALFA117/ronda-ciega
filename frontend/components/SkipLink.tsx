"use client";

import { useT } from "@/lib/i18n";

/**
 * The first stop for a keyboard, in the page's language.
 *
 * It lived in the root layout as a literal, "Ir al contenido", on a document
 * that opens in English: the one line a screen reader announces first was in
 * the other language.
 */
export function SkipLink() {
  const t = useT();
  return (
    <a href="#main" className="skip-link">
      {t.common.skip}
    </a>
  );
}
