"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useT } from "@/lib/i18n";
import { Label, Note, Panel } from "@/components/ui";

export default function NotFound() {
  const t = useT();

  return (
    <Panel className="mx-auto max-w-lg space-y-5 p-8 text-center">
      <Label>404</Label>
      {/* Every unknown path lands here, not only rounds: it said "Round not
          found" under /anything-at-all. */}
      <h1 className="text-xl font-medium tracking-tight">{t.notFound.title}</h1>
      <Note>{t.notFound.note}</Note>
      <Link
        href="/"
        className="inline-flex items-center gap-2 font-mono text-sm text-sealed transition-colors hover:text-chalk"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Ronda Ciega
      </Link>
    </Panel>
  );
}
