"use client";

import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

/** Enough for a round's rent prefund plus fees, with room to spare. */
const MIN_SOL = 0.05;

export interface Preflight {
  /** Connected wallet is pointed at a cluster that is not devnet. */
  wrongNetwork: boolean;
  /** Balance is too low for the next write to succeed. */
  lowBalance: boolean;
  balanceSol: number | null;
}

/**
 * Catches the two failures that otherwise surface as an opaque wallet error
 * after the user has already committed to an action: a wallet still on
 * mainnet, and a balance too small to pay rent.
 *
 * Network is inferred from the genesis hash rather than trusted from the
 * wallet, because adapters report the wallet's *selected* cluster
 * inconsistently across versions.
 */
export function usePreflight(): Preflight {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [state, setState] = useState<Preflight>({
    wrongNetwork: false,
    lowBalance: false,
    balanceSol: null,
  });

  useEffect(() => {
    let cancelled = false;
    if (!publicKey) {
      setState({ wrongNetwork: false, lowBalance: false, balanceSol: null });
      return;
    }

    (async () => {
      try {
        const [genesis, lamports] = await Promise.all([
          connection.getGenesisHash(),
          connection.getBalance(publicKey),
        ]);
        if (cancelled) return;
        const sol = lamports / LAMPORTS_PER_SOL;
        setState({
          // Devnet's genesis hash. Anything else means the app is talking to
          // a cluster where this program does not exist.
          wrongNetwork: genesis !== "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
          lowBalance: sol < MIN_SOL,
          balanceSol: sol,
        });
      } catch {
        // A failed check must not itself become a warning banner.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [connection, publicKey]);

  return state;
}
