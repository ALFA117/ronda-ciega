"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { easeEnter } from "@/lib/motion";
import { useT } from "@/lib/i18n";
import { LocaleToggle, ThemeToggle } from "./Toggles";

// The wallet button reads browser globals, so it can't be server-rendered.
const WalletMultiButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  {
    ssr: false,
    loading: () => (
      <div className="h-[38px] w-[132px] rounded-lg border border-edge bg-surface" />
    ),
  },
);

export function Nav() {
  const t = useT();

  return (
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={easeEnter}
      className="sticky top-0 z-40 mb-14 border-b border-edge/60 bg-bg/80 backdrop-blur-md"
    >
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-5 py-4 sm:px-8">
        <Link href="/" className="group flex items-baseline gap-3" aria-label={t.nav.home}>
          <span className="whitespace-nowrap text-sm font-medium tracking-tight">
            Ronda Ciega
          </span>
          <span className="hidden font-mono text-2xs text-muted transition-colors group-hover:text-sealed sm:inline">
            {t.nav.tagline}
          </span>
        </Link>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <span className="hidden items-center gap-1.5 rounded-lg border border-edge px-2.5 py-2 font-mono text-2xs text-muted lg:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-open" aria-hidden />
            {t.nav.network}
          </span>
          <LocaleToggle />
          <ThemeToggle />
          <WalletMultiButton />
        </div>
      </div>
    </motion.header>
  );
}
