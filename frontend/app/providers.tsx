"use client";

import { useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { DEVNET_RPC } from "@/lib/constants";
import { ThemeProvider } from "@/lib/theme";
import { LocaleProvider } from "@/lib/i18n";

import "@solana/wallet-adapter-react-ui/styles.css";

export function Providers({ children }: { children: React.ReactNode }) {
  // Empty adapter list: wallets that implement the Wallet Standard (Phantom,
  // Solflare, Backpack) register themselves.
  const wallets = useMemo(() => [], []);

  return (
    <ThemeProvider>
      <LocaleProvider>
        <ConnectionProvider endpoint={DEVNET_RPC}>
          <WalletProvider wallets={wallets} autoConnect>
            <WalletModalProvider>{children}</WalletModalProvider>
          </WalletProvider>
        </ConnectionProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
}
