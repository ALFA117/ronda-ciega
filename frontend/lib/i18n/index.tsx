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

const Ctx = createContext<LocaleCtx>({ locale: "es", setLocale: () => {}, t: es });

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  // Spanish on the server and on the first paint, so the markup the client
  // hydrates against always matches. The stored or browser preference is
  // applied in an effect instead of during render.
  const [locale, setLocaleState] = useState<Locale>("es");

  useEffect(() => {
    let next: Locale | null = null;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "es" || stored === "en") next = stored;
    } catch {
      /* private mode, blocked storage — fall through to the browser hint */
    }
    if (!next && typeof navigator !== "undefined") {
      next = navigator.language.toLowerCase().startsWith("es") ? "es" : "en";
    }
    if (next && next !== "es") setLocaleState(next);
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
