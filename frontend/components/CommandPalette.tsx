"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Connection } from "@solana/web3.js";
import { CornerDownLeft, Hash, Search, Sparkles } from "lucide-react";
import { DEVNET_RPC } from "@/lib/constants";
import { getReadProgram, RoundAccount } from "@/lib/program";
import { fetchRounds } from "@/lib/rounds";
import { matches } from "@/lib/search";
import { useT } from "@/lib/i18n";
import { springPanel } from "@/lib/motion";

interface Item {
  id: string;
  label: string;
  hint?: string;
  kind: "section" | "round";
  go: () => void;
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
  const panelRef = useRef<HTMLDivElement>(null);
  /** Whatever had focus before the palette took it. */
  const returnTo = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setCursor(0);
    // A dialog that closes onto nothing leaves a keyboard user back at the top
    // of the document, having lost their place.
    returnTo.current?.focus?.();
    returnTo.current = null;
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
    returnTo.current = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    const id = window.setTimeout(() => inputRef.current?.focus(), 40);

    // Without this, Tab walks straight out of the dialog and into the page
    // behind it, which is still there and still scrolled where it was.
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'input, button, [href], [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panelRef.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", trap);

    return () => {
      document.body.style.overflow = "";
      window.clearTimeout(id);
      window.removeEventListener("keydown", trap);
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
      { id: "probar", label: t.play.label, kind: "section", go: jump("probar") },
      { id: "problema", label: t.problem.label, kind: "section", go: jump("problema") },
      { id: "como-funciona", label: t.solution.label, kind: "section", go: jump("como-funciona") },
      { id: "commit-reveal", label: t.compare.label, kind: "section", go: jump("commit-reveal") },
      { id: "medido", label: t.stats.label, kind: "section", go: jump("medido") },
      { id: "limites", label: t.limits.label, kind: "section", go: jump("limites") },
      { id: "rondas", label: t.rounds.label, kind: "section", go: jump("rondas") },
      {
        id: "proof",
        label: t.proof.label,
        hint: "/proof",
        kind: "section",
        go: () => {
          close();
          router.push("/proof");
        },
      },
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
        /* xl, not lg: the menu button is xl:hidden, so between 1024 and
           1279 both were on screen at once — and the menu sheet carries its
           own search row, which made three ways into one thing and two of
           them visible together. Above xl the sheet is gone and this is the
           only way in; below it, the sheet is. */
        className="glass fixed bottom-5 right-5 z-30 hidden h-11 items-center gap-2 rounded-xl px-3.5 font-mono text-2xs text-muted transition-colors hover:text-chalk xl:flex"
      >
        <Search className="h-3.5 w-3.5" aria-hidden />
        {t.palette.open}
        <kbd className="rounded border border-edge px-1.5 py-0.5 text-[10px]">⌘K</kbd>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]">
            {/* No exit animation on a modal layer.
                AnimatePresence keeps the element mounted until its exit
                finishes, so where no animation runs a dismissed dialog stays
                on screen — aria-expanded already false, focus still trapped
                inside something the person asked to close. Collapse.tsx
                reached this same conclusion after two animated versions both
                failed; this is the same rule applied where the stakes are a
                modal rather than a panel. */}
            <motion.div
              className="absolute inset-0 bg-bg/75 backdrop-blur-sm"
              initial={reduce ? undefined : { opacity: 0 }}
              animate={reduce ? undefined : { opacity: 1 }}
              transition={{ duration: 0.15 }}
              onClick={close}
              aria-hidden
            />

            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label={t.palette.open}
              className="glass relative w-full max-w-lg overflow-hidden rounded-2xl"
              initial={reduce ? undefined : { y: -12, scale: 0.98 }}
              animate={reduce ? undefined : { y: 0, scale: 1 }}
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
