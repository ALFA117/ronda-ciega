"use client";

import { useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { MotionConfig } from "framer-motion";
import { DEVNET_RPC } from "@/lib/constants";
import { ThemeProvider } from "@/lib/theme";
import { LocaleProvider } from "@/lib/i18n";
import { ToastProvider } from "@/components/Toast";

import "@solana/wallet-adapter-react-ui/styles.css";

export function Providers({ children }: { children: React.ReactNode }) {
  // Empty adapter list: wallets that implement the Wallet Standard (Phantom,
  // Solflare, Backpack) register themselves.
  const wallets = useMemo(() => [], []);

  return (
    // Framer animates through inline styles from JavaScript, so the
    // stylesheet's prefers-reduced-motion block does not reach it — every
    // component had to remember to ask, and three had forgotten. This makes
    // the preference the default for all of them at once, which is also the
    // only version that stays true as components are added.
    <MotionConfig reducedMotion="user">
      <ThemeProvider>
        <LocaleProvider>
          <ConnectionProvider endpoint={DEVNET_RPC}>
            <WalletProvider wallets={wallets} autoConnect>
              <WalletModalProvider>
                <ToastProvider>{children}</ToastProvider>
              </WalletModalProvider>
            </WalletProvider>
          </ConnectionProvider>
        </LocaleProvider>
      </ThemeProvider>
    </MotionConfig>
  );
}
