"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { easeEnter } from "@/lib/motion";

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
  return (
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={easeEnter}
      className="sticky top-0 z-40 mb-14 border-b border-edge/60 bg-bg/80 backdrop-blur-md"
    >
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
        <Link
          href="/"
          className="group flex items-baseline gap-3 rounded-md"
          aria-label="Ronda Ciega, inicio"
        >
          <span className="text-sm font-medium tracking-tight">Ronda Ciega</span>
          <span className="hidden font-mono text-2xs text-muted transition-colors group-hover:text-sealed sm:inline">
            matching ciego
          </span>
        </Link>

        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-1.5 rounded-md border border-edge px-2 py-1 font-mono text-2xs text-muted sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-open" aria-hidden />
            Devnet
          </span>
          <WalletMultiButton />
        </div>
      </div>
    </motion.header>
  );
}
