import type { Metadata } from "next";

// The page is a client component, so its metadata lives here.
export const metadata: Metadata = {
  title: "Proof",
  description:
    "Four hundred random markets run through the same matching code the chain runs, searched in your browser for a single blocking pair.",
  alternates: { canonical: "/proof" },
  openGraph: { url: "https://ronda-ciega.vercel.app/proof" },
};

export default function ProofLayout({ children }: { children: React.ReactNode }) {
  return children;
}
