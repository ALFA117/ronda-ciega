"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { PROGRAM_ID } from "@/lib/constants";
import { useT } from "@/lib/i18n";

const LINKS = [
  { label: "Proof", href: "/proof" },
  { label: "GitHub", href: "https://github.com/ALFA117/ronda-ciega" },
  {
    label: "Program",
    href: `https://explorer.solana.com/address/${PROGRAM_ID.toBase58()}?cluster=devnet`,
  },
  { label: "MagicBlock", href: "https://docs.magicblock.gg" },
  { label: "Solana Blitz v8", href: "https://build.magicblock.app/?stage=blitz" },
];

export function Footer() {
  const t = useT();

  return (
    <footer className="bleed-rule mt-24 pt-10">
      <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <p className="font-mono text-sm">Ronda Ciega</p>
          <p className="max-w-[34ch] text-xs leading-relaxed text-muted">
            {t.hero.lede}
          </p>
        </div>

        <nav className="grid grid-cols-2 gap-x-10 gap-y-3 sm:flex sm:gap-8">
          {LINKS.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              target="_blank"
              rel="noreferrer"
              className="group inline-flex items-center gap-1 font-mono text-2xs text-muted transition-colors hover:text-chalk"
            >
              {l.label}
              <ArrowUpRight
                className="h-3 w-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                aria-hidden
              />
            </Link>
          ))}
        </nav>
      </div>

      <p className="mt-10 font-mono text-[10px] uppercase tracking-[0.18em] text-muted/70">
        Devnet · MIT
      </p>
    </footer>
  );
}
