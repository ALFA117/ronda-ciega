"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { easeEnter } from "@/lib/motion";
import { useT } from "@/lib/i18n";
import { LocaleToggle, ThemeToggle } from "./Toggles";

const WalletMultiButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  {
    ssr: false,
    loading: () => <div className="glass h-11 w-[132px] rounded-xl sm:h-10" />,
  },
);

/**
 * A single floating glass bar rather than a full-width band with a rule under
 * it. The old header pushed the page down and read as a separate slab; this
 * one hovers over the content it belongs to, and the gap below it is a third
 * of what it was.
 */
export function Nav() {
  const t = useT();

  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={easeEnter}
      className="sticky top-0 z-40 mb-6 px-3 pt-3 sm:px-5 sm:pt-4"
    >
      <div className="glass mx-auto flex w-full max-w-6xl items-center gap-2 rounded-2xl px-3 py-2 sm:px-4">
        <Link
          href="/"
          className="mr-auto flex items-baseline gap-2.5 rounded-lg"
          aria-label={t.nav.home}
        >
          <span className="whitespace-nowrap text-sm font-medium tracking-tight">
            Ronda Ciega
          </span>
          <span className="hidden font-mono text-2xs text-muted lg:inline">
            {t.nav.tagline}
          </span>
        </Link>

        <nav className="mr-2 hidden items-center gap-5 xl:flex" aria-label="Secciones">
          {[
            { href: "#como-funciona", text: t.solution.label },
            { href: "#commit-reveal", text: t.compare.label },
            { href: "#rondas", text: t.rounds.label },
          ].map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="font-mono text-2xs text-muted transition-colors hover:text-chalk"
            >
              {l.text}
            </Link>
          ))}
        </nav>

        <LocaleToggle />
        <ThemeToggle />
        <WalletMultiButton />
      </div>
    </motion.header>
  );
}
