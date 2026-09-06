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
      whileTap={reduce ? undefined : { scale: 0.92 }}
      transition={springSnappy}
      className="glass flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-muted transition-colors hover:text-chalk sm:h-10 sm:w-10"
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
  const reduce = useReducedMotion();
  const t = useT();

  return (
    <div
      className="glass relative flex h-12 shrink-0 items-center rounded-xl p-0 sm:h-10 sm:p-1"
      role="group"
      aria-label={t.nav.language}
    >
      {(["es", "en"] as const).map((l) => (
        <motion.button
          key={l}
          onClick={() => setLocale(l)}
          aria-pressed={locale === l}
          whileTap={reduce ? undefined : { scale: 0.92 }}
          transition={springSnappy}
          className={`relative z-10 flex h-full min-w-[44px] cursor-pointer sm:min-w-[34px] items-center justify-center rounded-lg px-2 font-mono text-2xs uppercase transition-colors ${
            locale === l ? "text-chalk" : "text-muted hover:text-chalk"
          }`}
        >
          {locale === l && (
            // One shared element slides between the two options instead of two
            // backgrounds crossfading.
            <motion.span
              layoutId="locale-pill"
              className="glass glass-sealed absolute inset-0 -z-10 rounded-lg"
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
            />
          )}
          {l}
        </motion.button>
      ))}
    </div>
  );
}
