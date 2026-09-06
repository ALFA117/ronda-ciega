"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { es, type Dictionary } from "./es";
import { en } from "./en";

export type Locale = "es" | "en";

const DICTS: Record<Locale, Dictionary> = { es, en };
const STORAGE_KEY = "rc-locale";

interface LocaleCtx {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: Dictionary;
}

const Ctx = createContext<LocaleCtx>({ locale: "en", setLocale: () => {}, t: en });

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  // English on the server and on the first paint, so the markup the client
  // hydrates against always matches, and so a visitor from anywhere can read
  // the page. A stored choice or a Spanish browser switches it in an effect
  // rather than during render.
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    let next: Locale | null = null;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "es" || stored === "en") next = stored;
    } catch {
      /* private mode, blocked storage — fall through to the browser hint */
    }
    // No browser sniffing. This is a global competition and the page has to
    // read the same way for whoever opens it; a visitor who wants Spanish has
    // the toggle, and that choice is what gets remembered.
    if (next && next !== "en") setLocaleState(next);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* not being able to remember the choice is not worth breaking on */
    }
  }, []);

  const value = useMemo(
    () => ({ locale, setLocale, t: DICTS[locale] }),
    [locale, setLocale],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The dictionary for the active locale. */
export function useT(): Dictionary {
  return useContext(Ctx).t;
}

export function useLocale() {
  const { locale, setLocale } = useContext(Ctx);
  return { locale, setLocale };
}
