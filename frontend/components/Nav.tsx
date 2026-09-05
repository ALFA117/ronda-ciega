"use client";

import Link from "next/link";
import dynamic from "next/dynamic";

// The wallet button reads browser globals, so it can't be server-rendered.
const WalletMultiButton = dynamic(
  async () =>
    (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false },
);

export function Nav() {
  return (
    <header className="mx-auto mb-12 flex w-full max-w-5xl items-center justify-between px-6 py-6">
      <Link href="/" className="group flex items-baseline gap-3">
        <span className="text-[15px] font-medium tracking-tight">
          Ronda Ciega
        </span>
        <span className="hidden font-mono text-[11px] text-muted sm:inline">
          matching ciego · devnet
        </span>
      </Link>
      <div className="flex items-center gap-3">
        <span className="hidden rounded border border-edge px-2 py-1 font-mono text-[11px] text-muted sm:inline">
          Devnet
        </span>
        <WalletMultiButton />
      </div>
    </header>
  );
}
