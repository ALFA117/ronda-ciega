"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  ConnectionProvider,
  WalletProvider,
  useWallet,
} from "@solana/wallet-adapter-react";
import type { PublicKey } from "@solana/web3.js";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { MotionConfig } from "framer-motion";
import { DEVNET_RPC } from "@/lib/constants";
import { ThemeProvider } from "@/lib/theme";
import { LocaleProvider } from "@/lib/i18n";
import { ToastProvider } from "@/components/Toast";
import { clearTeeSession } from "@/lib/tee";

import "@solana/wallet-adapter-react-ui/styles.css";

/**
 * Disconnecting has to forget the enclave token too.
 *
 * The token now survives reloads, which is the whole point — but that means
 * "disconnect" would otherwise leave a live read credential for that wallet
 * sitting in the browser of whoever uses the machine next. Someone hitting
 * disconnect is asking for exactly this.
 */
function TeeSessionLifecycle() {
  const { publicKey } = useWallet();
  const last = useRef<PublicKey | null>(null);

  useEffect(() => {
    if (last.current && !publicKey) clearTeeSession(last.current);
    last.current = publicKey ?? null;
  }, [publicKey]);

  return null;
}

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
                <TeeSessionLifecycle />
                <ToastProvider>{children}</ToastProvider>
              </WalletModalProvider>
            </WalletProvider>
          </ConnectionProvider>
        </LocaleProvider>
      </ThemeProvider>
    </MotionConfig>
  );
}
