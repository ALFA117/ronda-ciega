"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertCircle, Check, X } from "lucide-react";
import { springPanel } from "@/lib/motion";

type Tone = "ok" | "error";
interface Toast {
  id: number;
  text: string;
  tone: Tone;
}

const Ctx = createContext<(text: string, tone?: Tone) => void>(() => {});

/**
 * Toasts announce themselves to screen readers via `aria-live="polite"` and
 * never take focus — a confirmation that steals the caret mid-form is worse
 * than no confirmation. Errors stay until dismissed; successes fade.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(0);
  const reduce = useReducedMotion();

  const dismiss = useCallback(
    (id: number) => setToasts((t) => t.filter((x) => x.id !== id)),
    [],
  );

  const push = useCallback(
    (text: string, tone: Tone = "ok") => {
      const id = next.current++;
      setToasts((t) => [...t, { id, text, tone }]);
      if (tone === "ok") {
        window.setTimeout(() => dismiss(id), 4000);
      }
    },
    [dismiss],
  );

  const value = useMemo(() => push, [push]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              // Errors are delivered here. Fading in from nothing means a
              // stalled tab reports failures silently, which is the one thing
              // a notification must never do.
              initial={reduce ? undefined : { y: 16, scale: 0.96 }}
              animate={reduce ? undefined : { y: 0, scale: 1 }}
              exit={reduce ? undefined : { scale: 0.96 }}
              transition={springPanel}
              // Flick it away. The same gesture people already use on every
              // notification they have ever dismissed.
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.5}
              onDragEnd={(_, info) => {
                if (Math.abs(info.offset.x) > 90) dismiss(t.id);
              }}
              className={`glass pointer-events-auto flex w-full max-w-sm cursor-grab touch-pan-y items-start gap-3 rounded-2xl px-4 py-3 active:cursor-grabbing ${
                t.tone === "ok" ? "glass-sealed" : "border-red-500/40"
              }`}
            >
              {t.tone === "ok" ? (
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sealed" aria-hidden />
              ) : (
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" aria-hidden />
              )}
              <span className="flex-1 break-words font-mono text-2xs leading-relaxed">
                {t.text}
              </span>
              <button
                onClick={() => dismiss(t.id)}
                aria-label="×"
                className="shrink-0 cursor-pointer text-muted transition-colors hover:text-chalk"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  return useContext(Ctx);
}
