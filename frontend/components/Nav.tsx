"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Menu, Search, X } from "lucide-react";
import { easeEnter, springPanel, springSnappy } from "@/lib/motion";
import { useT } from "@/lib/i18n";
import { useActiveSection } from "@/hooks/useActiveSection";
import { LocaleToggle, ThemeToggle } from "./Toggles";

const WalletMultiButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  {
    ssr: false,
    loading: () => <div className="glass h-11 w-[132px] rounded-xl sm:h-10" />,
  },
);

/** Must stay in step with `links` below: a tracked section with no link
 * leaves the highlight nowhere to go while the reader is inside it. */
const SECTION_IDS = [
  "probar",
  "problema",
  "como-funciona",
  "commit-reveal",
  "medido",
  "limites",
  "rondas",
];

export function Nav() {
  const t = useT();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const active = useActiveSection(SECTION_IDS);

  const links = [
    { id: "probar", text: t.play.label },
    { id: "problema", text: t.problem.label },
    { id: "como-funciona", text: t.solution.label },
    { id: "commit-reveal", text: t.compare.label },
    { id: "medido", text: t.stats.label },
    { id: "limites", text: t.limits.label },
    { id: "rondas", text: t.rounds.label },
  ];

  // A drawer that survives a back gesture or an Escape is the difference
  // between a menu and a trap.
  //
  // The focus handling is the other half of that: a keyboard user who opens
  // the sheet should land inside it, be unable to tab out behind it, and end
  // up back on the button they pressed — not at the top of the document.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab" || !sheetRef.current) return;
      const focusable = sheetRef.current.querySelectorAll<HTMLElement>(
        'a[href], button, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !sheetRef.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    const id = window.setTimeout(
      () => sheetRef.current?.querySelector<HTMLElement>("button")?.focus(),
      60,
    );

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      window.clearTimeout(id);
      opener?.focus?.();
    };
  }, [open]);

  return (
    <>
      {/* The header arrives by moving. Fading it in from opacity 0 made the
          animation load-bearing for the whole navigation — logo, sections,
          wallet button, theme and language — and this was also the one motion
          in the app with no reduced-motion guard, so it ran regardless of the
          preference. */}
      <motion.header
        initial={reduce ? undefined : { y: -10 }}
        animate={reduce ? undefined : { y: 0 }}
        transition={easeEnter}
        className="sticky top-0 z-40 mb-6 px-3 pt-3 sm:px-5 sm:pt-4"
      >
        <div className="glass glass-spill mx-auto flex w-full max-w-6xl items-center gap-3 rounded-2xl px-3 py-2 sm:px-4">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2.5 rounded-lg"
            aria-label={t.nav.home}
          >
            <span className="whitespace-nowrap text-sm font-medium leading-none tracking-tight">
              Ronda Ciega
            </span>
            <span className="hidden font-mono text-2xs leading-none text-muted lg:inline">
              {t.nav.tagline}
            </span>
          </Link>

          {/* Section links, centred in the space the logo and controls leave.
              Each carries a shared underline that slides to whichever section
              you are reading — no click needed to know where you are. */}
          <nav
            className="mx-auto hidden items-center gap-1 xl:flex"
            aria-label={t.nav.sections}
          >
            {links.map((l) => (
              <Link
                key={l.id}
                href={`#${l.id}`}
                aria-current={active === l.id ? "true" : undefined}
                className={`relative rounded-lg px-3 py-2 font-mono text-2xs leading-none transition-colors ${
                  active === l.id ? "text-chalk" : "text-muted hover:text-chalk"
                }`}
              >
                {active === l.id && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 -z-10 rounded-lg bg-sealed/12"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                {l.text}
              </Link>
            ))}
          </nav>

          {/* Below sm the bar cannot hold the wallet button and the language
              toggle without running off the right edge of a phone, so both
              move into the sheet, where they get full-size rows. */}
          <div className="ml-auto flex shrink-0 items-center gap-2.5">
            <div className="hidden sm:block">
              <LocaleToggle />
            </div>
            <ThemeToggle />
            <div className="hidden sm:block">
              <WalletMultiButton />
            </div>

            <motion.button
              onClick={() => setOpen(true)}
              aria-label={t.nav.menu}
              aria-expanded={open}
              whileTap={reduce ? undefined : { scale: 0.93 }}
              transition={springSnappy}
              className="glass flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl text-muted transition-colors hover:text-chalk sm:h-10 sm:w-10 xl:hidden"
            >
              <Menu className="h-4 w-4" aria-hidden />
            </motion.button>
          </div>
        </div>
      </motion.header>

      {/* Below xl there were simply no section links at all. This is that
          menu, as a sheet rather than a cramped row. */}
      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-50 xl:hidden">
            {/* No exit animation on a modal layer.
                AnimatePresence keeps the element mounted until its exit
                finishes, so where no animation runs a dismissed dialog stays
                on screen — aria-expanded already false, focus still trapped
                inside something the person asked to close. Collapse.tsx
                reached this same conclusion after two animated versions both
                failed; this is the same rule applied where the stakes are a
                modal rather than a panel. */}
            <motion.div
              className="absolute inset-0 bg-bg/70 backdrop-blur-sm"
              initial={reduce ? undefined : { opacity: 0 }}
              animate={reduce ? undefined : { opacity: 1 }}
              transition={{ duration: 0.18 }}
              onClick={() => setOpen(false)}
              aria-hidden
            />

            <motion.div
              ref={sheetRef}
              role="dialog"
              aria-modal="true"
              aria-label={t.nav.menu}
              className="glass absolute inset-x-3 top-3 rounded-2xl p-3 sm:inset-x-5 sm:top-4"
              initial={reduce ? undefined : { y: -14, scale: 0.98 }}
              animate={reduce ? undefined : { y: 0, scale: 1 }}
              transition={springPanel}
              // Flick the sheet up to close it.
              drag={reduce ? false : "y"}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={0.3}
              onDragEnd={(_, info) => {
                if (info.offset.y < -60) setOpen(false);
              }}
            >
              <div className="mb-2 flex items-center justify-between px-2">
                <span className="font-mono text-2xs uppercase tracking-[0.18em] text-muted">
                  {t.nav.menu}
                </span>
                <motion.button
                  onClick={() => setOpen(false)}
                  aria-label={t.common.close}
                  whileTap={reduce ? undefined : { scale: 0.92 }}
                  className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-muted hover:text-chalk"
                >
                  <X className="h-4 w-4" aria-hidden />
                </motion.button>
              </div>

              {/* The palette's keyboard shortcut does not exist on a phone,
                  so this is how it is reached there. */}
              <button
                onClick={() => {
                  setOpen(false);
                  window.dispatchEvent(new Event("open-palette"));
                }}
                className="mb-2 flex h-12 w-full items-center gap-3 rounded-xl bg-surface2 px-3 font-mono text-sm text-muted transition-colors hover:text-chalk"
              >
                <Search className="h-4 w-4" aria-hidden />
                {t.palette.placeholder}
              </button>

              {/* The bar drops these below sm; this is where they live there. */}
              <div className="mb-2 flex items-center gap-2 sm:hidden">
                <LocaleToggle />
                <div className="wallet-block min-w-0 flex-1">
                  <WalletMultiButton />
                </div>
              </div>

              <ul className="grid gap-1">
                {links.map((l, i) => (
                  <motion.li
                    key={l.id}
                    initial={reduce ? undefined : { x: -10 }}
                    animate={reduce ? undefined : { opacity: 1, x: 0 }}
                    transition={{ delay: 0.03 * i, ...springPanel }}
                  >
                    <Link
                      href={`#${l.id}`}
                      onClick={() => setOpen(false)}
                      className={`flex h-12 items-center justify-between rounded-xl px-3 font-mono text-sm transition-colors ${
                        active === l.id
                          ? "bg-sealed/12 text-chalk"
                          : "text-muted hover:bg-surface2 hover:text-chalk"
                      }`}
                    >
                      {l.text}
                      <span className="tnum text-2xs text-muted">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                    </Link>
                  </motion.li>
                ))}
              </ul>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
