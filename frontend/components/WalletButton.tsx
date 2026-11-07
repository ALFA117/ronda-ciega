"use client";

import dynamic from "next/dynamic";
import { useT } from "@/lib/i18n";

/**
 * The wallet adapter's button, speaking the page's language.
 *
 * `WalletMultiButton` hard-codes its English labels, so on a page switched to
 * Spanish the one control everybody has to press still said "Select Wallet".
 * The base button takes the labels as a prop; this hands it the dictionary's.
 * Loaded on the client only, like the adapter's own button, and holding its
 * place while it loads so the bar does not jump.
 */
const BaseWalletMultiButton = dynamic(
  async () =>
    (await import("@solana/wallet-adapter-react-ui")).BaseWalletMultiButton,
  {
    ssr: false,
    loading: () => <div className="glass h-11 w-[132px] rounded-xl" />,
  },
);

export function WalletButton() {
  const t = useT();
  return (
    <BaseWalletMultiButton
      labels={{
        "no-wallet": t.wallet.select,
        "has-wallet": t.wallet.connect,
        connecting: t.wallet.connecting,
        "copy-address": t.wallet.copy,
        copied: t.wallet.copied,
        "change-wallet": t.wallet.change,
        disconnect: t.wallet.disconnect,
      }}
    />
  );
}
