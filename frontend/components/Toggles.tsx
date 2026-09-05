"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { useLocale, useT } from "@/lib/i18n";
import { springSnappy } from "@/lib/motion";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const reduce = useReducedMotion();
  const t = useT();

  return (
    <motion.button
      onClick={toggle}
      aria-label={t.nav.theme}
      title={t.nav.theme}
      whileHover={reduce ? undefined : { scale: 1.05 }}
      whileTap={reduce ? undefined : { scale: 0.94 }}
      transition={springSnappy}
      className="flex h-[38px] w-[38px] cursor-pointer items-center justify-center rounded-lg border border-edge text-muted transition-colors hover:border-sealed hover:text-chalk"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          initial={reduce ? undefined : { opacity: 0, rotate: -90, scale: 0.6 }}
          animate={reduce ? undefined : { opacity: 1, rotate: 0, scale: 1 }}
          exit={reduce ? undefined : { opacity: 0, rotate: 90, scale: 0.6 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className="flex"
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4" aria-hidden />
          ) : (
            <Moon className="h-4 w-4" aria-hidden />
          )}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}

export function LocaleToggle() {
  const { locale, setLocale } = useLocale();
  const t = useT();

  return (
    <div
      className="relative flex h-[38px] items-center rounded-lg border border-edge p-0.5"
      role="group"
      aria-label={t.nav.language}
    >
      {(["es", "en"] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLocale(l)}
          aria-pressed={locale === l}
          className={`relative z-10 h-full cursor-pointer rounded-md px-2.5 font-mono text-2xs uppercase transition-colors ${
            locale === l ? "text-onSealed" : "text-muted hover:text-chalk"
          }`}
        >
          {locale === l && (
            // One shared element slides between the two options instead of two
            // backgrounds fading in and out.
            <motion.span
              layoutId="locale-pill"
              className="absolute inset-0 -z-10 rounded-md bg-sealed"
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
            />
          )}
          {l}
        </button>
      ))}
    </div>
  );
}
