import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicKey } from "@solana/web3.js";

/**
 * Is this even shaped like an account address.
 *
 * Whether the account exists is a question for the RPC, and the page asks it
 * on the client. Whether the string could be one is not: `/round/notanaddress`
 * answered 200 with a 404 painted inside it, which tells a crawler, a link
 * checker and a judge's tab that the page is fine.
 */
function isAddress(s: string): boolean {
  try {
    new PublicKey(decodeURIComponent(s));
    return true;
  } catch {
    return false;
  }
}

export function generateMetadata({ params }: { params: { address: string } }): Metadata {
  const short = `${params.address.slice(0, 4)}…${params.address.slice(-4)}`;
  return {
    title: `Round ${short}`,
    description: "A Ronda Ciega round on Solana devnet: who joined, its deadline and, once it settles, the published pairings.",
    alternates: { canonical: `/round/${params.address}` },
  };
}

export default function RoundLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { address: string };
}) {
  if (!isAddress(params.address)) notFound();
  return children;
}
