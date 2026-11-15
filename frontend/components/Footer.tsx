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
  const id = PROGRAM_ID.toBase58();

  return (
    <footer className="bleed-rule mt-24 pt-12">
      <div className="grid gap-10 md:grid-cols-[1fr_auto]">
        <div className="space-y-3">
          <p className="font-display text-2xl font-medium">Ronda Ciega</p>
          <p className="max-w-[40ch] text-sm leading-relaxed text-muted">
            {t.hero.headline} {t.hero.subline}
          </p>
          <p className="font-mono text-2xs text-dim" title={id}>
            Program · {id.slice(0, 6)}…{id.slice(-6)}
          </p>
        </div>

        <nav className="grid grid-cols-2 gap-x-10 gap-y-1 sm:grid-cols-3 md:grid-cols-1">
          {LINKS.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              target="_blank"
              rel="noreferrer"
              className="group inline-flex min-h-[44px] items-center gap-1.5 text-sm text-muted transition-colors hover:text-chalk"
            >
              {l.label}
              <ArrowUpRight
                className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
          ))}
        </nav>
      </div>

      <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-edge py-6 font-mono text-2xs text-dim">
        <span>Solana devnet · MIT</span>
        <span>Solana Blitz v8 · MagicBlock</span>
      </div>
    </footer>
  );
}
