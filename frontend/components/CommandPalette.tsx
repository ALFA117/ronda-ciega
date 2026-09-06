"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Connection } from "@solana/web3.js";
import { CornerDownLeft, Hash, Search, Sparkles } from "lucide-react";
import { DEVNET_RPC } from "@/lib/constants";
import { getReadProgram, RoundAccount } from "@/lib/program";
import { fetchRounds } from "@/lib/rounds";
import { useT } from "@/lib/i18n";
import { springPanel } from "@/lib/motion";

interface Item {
  id: string;
  label: string;
  hint?: string;
  kind: "section" | "round";
  go: () => void;
}

/** Subsequence match, so "cmrv" finds "commit-reveal". */
function matches(haystack: string, needle: string): boolean {
  if (!needle) return true;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  let i = 0;
  for (const ch of h) {
    if (ch === n[i]) i++;
    if (i === n.length) return true;
  }
  return false;
}

/**
 * Jump anywhere by typing.
 *
 * Rounds are fetched the first time the palette opens rather than on page
 * load: most visitors never press the key, and the list is the expensive part
 * of this page.
 */
export function CommandPalette() {
  const t = useT();
  const router = useRouter();
  const reduce = useReducedMotion();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [rounds, setRounds] = useState<RoundAccount[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setCursor(0);
  }, []);

  // Open with the platform's own shortcut, close with Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        close();
      }
    };
    const openIt = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-palette", openIt);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-palette", openIt);
    };
  }, [close]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const id = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => {
      document.body.style.overflow = "";
      window.clearTimeout(id);
    };
  }, [open]);

  useEffect(() => {
    if (!open || rounds) return;
    (async () => {
      try {
        const connection = new Connection(DEVNET_RPC, "confirmed");
        const { rounds: found } = await fetchRounds(connection, getReadProgram(connection));
        setRounds(found);
      } catch {
        setRounds([]);
      }
    })();
  }, [open, rounds]);

  const items = useMemo<Item[]>(() => {
    const jump = (id: string) => () => {
      close();
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
      else router.push(`/#${id}`);
    };

    const sections: Item[] = [
      { id: "problema", label: t.problem.label, kind: "section", go: jump("problema") },
      { id: "como-funciona", label: t.solution.label, kind: "section", go: jump("como-funciona") },
      { id: "commit-reveal", label: t.compare.label, kind: "section", go: jump("commit-reveal") },
      { id: "medido", label: t.stats.label, kind: "section", go: jump("medido") },
      { id: "limites", label: t.limits.label, kind: "section", go: jump("limites") },
      { id: "rondas", label: t.rounds.label, kind: "section", go: jump("rondas") },
    ];

    const roundItems: Item[] = (rounds ?? []).map((r) => ({
      id: r.address.toBase58(),
      label: `#${r.roundId.toString().slice(-6)}`,
      hint: `${r.founderCount}×${r.builderCount} · ${t.status[r.status] ?? r.status}`,
      kind: "round" as const,
      go: () => {
        close();
        router.push(`/round/${r.address.toBase58()}`);
      },
    }));

    return [...sections, ...roundItems];
  }, [t, rounds, router, close, reduce]);

  const filtered = useMemo(
    () => items.filter((i) => matches(i.label + " " + (i.hint ?? ""), query)),
    [items, query],
  );

  useEffect(() => setCursor(0), [query]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      filtered[cursor]?.go();
    }
  };

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    listRef.current?.children[cursor]?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  return (
    <>
      {/* A shortcut nobody can see is a shortcut nobody uses. */}
      <button
        onClick={() => setOpen(true)}
        aria-label={t.palette.open}
        className="glass fixed bottom-5 right-5 z-30 hidden h-11 items-center gap-2 rounded-xl px-3.5 font-mono text-2xs text-muted transition-colors hover:text-chalk lg:flex"
      >
        <Search className="h-3.5 w-3.5" aria-hidden />
        {t.palette.open}
        <kbd className="rounded border border-edge px-1.5 py-0.5 text-[10px]">⌘K</kbd>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]"
            initial={reduce ? undefined : { opacity: 0 }}
            animate={reduce ? undefined : { opacity: 1 }}
            exit={reduce ? undefined : { opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div
              className="absolute inset-0 bg-bg/75 backdrop-blur-sm"
              onClick={close}
              aria-hidden
            />

            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={t.palette.open}
              className="glass relative w-full max-w-lg overflow-hidden rounded-2xl"
              initial={reduce ? undefined : { opacity: 0, y: -12, scale: 0.98 }}
              animate={reduce ? undefined : { opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? undefined : { opacity: 0, y: -8, scale: 0.98 }}
              transition={springPanel}
            >
              <div className="flex items-center gap-3 border-b border-edge px-4">
                <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder={t.palette.placeholder}
                  aria-label={t.palette.placeholder}
                  className="h-14 w-full bg-transparent font-mono text-[16px] text-chalk outline-none placeholder:text-dim"
                />
              </div>

              <ul ref={listRef} className="max-h-[46vh] overflow-y-auto p-2">
                {filtered.length === 0 && (
                  <li className="px-3 py-6 text-center font-mono text-2xs text-muted">
                    {rounds === null ? t.common.loading : t.palette.empty}
                  </li>
                )}

                {filtered.map((item, i) => (
                  <li key={item.kind + item.id}>
                    <button
                      onClick={item.go}
                      onMouseEnter={() => setCursor(i)}
                      aria-current={i === cursor ? "true" : undefined}
                      className={`flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left font-mono text-sm transition-colors ${
                        i === cursor
                          ? "bg-sealed/12 text-chalk"
                          : "text-muted hover:text-chalk"
                      }`}
                    >
                      {item.kind === "round" ? (
                        <Hash className="h-3.5 w-3.5 shrink-0 text-sealed" aria-hidden />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                      )}
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.hint && (
                        <span className="shrink-0 text-2xs text-muted">{item.hint}</span>
                      )}
                      {i === cursor && (
                        <CornerDownLeft className="h-3 w-3 shrink-0 text-muted" aria-hidden />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
