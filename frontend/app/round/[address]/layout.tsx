import type { Metadata } from "next";

export function generateMetadata({ params }: { params: { address: string } }): Metadata {
  const short = `${params.address.slice(0, 4)}…${params.address.slice(-4)}`;
  return {
    title: `Round ${short}`,
    description: "A Ronda Ciega round on Solana devnet: who joined, its deadline and, once it settles, the published pairings.",
    alternates: { canonical: `/round/${params.address}` },
  };
}

export default function RoundLayout({ children }: { children: React.ReactNode }) {
  return children;
}
