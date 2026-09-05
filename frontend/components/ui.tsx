"use client";

import Link from "next/link";
import { useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, Loader2 } from "lucide-react";
import { easeEnter, riseIn, springSnappy, stagger } from "@/lib/motion";
import { useOnScreen } from "@/hooks/useOnScreen";
import { useT } from "@/lib/i18n";

export function Panel({
  children,
  className = "",
  sealed = false,
}: {
  children: React.ReactNode;
  className?: string;
  sealed?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border ${
        sealed ? "border-sealed/25 sealed-hatch" : "border-edge"
      } bg-surface/70 ${className}`}
    >
      {children}
    </div>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-2xs uppercase tracking-[0.18em] text-muted">
      {children}
    </div>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  busy,
  variant = "primary",
  type = "button",
  full = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: "primary" | "ghost" | "sealed";
  type?: "button" | "submit";
  full?: boolean;
}) {
  const reduce = useReducedMotion();
  const styles = {
    primary: "bg-chalk text-bg hover:bg-white",
    ghost: "border border-edge text-chalk hover:border-edgeStrong hover:bg-surface2",
    sealed:
      "border border-sealed/40 bg-sealed/10 text-sealed hover:bg-sealed/20 hover:border-sealed/60",
  }[variant];

  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      // Scale stays inside 0.95-1.05; anything larger reads as janky.
      whileHover={reduce || disabled ? undefined : { scale: 1.02 }}
      whileTap={reduce || disabled ? undefined : { scale: 0.97 }}
      transition={springSnappy}
      className={`inline-flex h-10 min-w-[44px] cursor-pointer items-center justify-center gap-2 rounded-lg px-4 font-mono text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${styles} ${
        full ? "w-full" : ""
      }`}
    >
      {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
      {children}
    </motion.button>
  );
}

export function StatusPill({ status }: { status: string }) {
  const t = useT();
  const tone: Record<string, string> = {
    open: "border-open/40 text-open bg-open/5",
    sealing: "border-sealed/40 text-sealed bg-sealed/5",
    matching: "border-sealed/40 text-sealed bg-sealed/5",
    settled: "border-edge text-muted",
  };
  const label: Record<string, string> = t.status;
  return (
    <span
      className={`rounded-md border px-2 py-0.5 font-mono text-2xs ${
        tone[status] || "border-edge text-muted"
      }`}
    >
      {label[status] || status}
    </span>
  );
}

export function Tag({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "sealed" | "open";
}) {
  const tones = {
    muted: "border-edge text-muted",
    sealed: "border-sealed/40 text-sealed bg-sealed/5",
    open: "border-open/40 text-open bg-open/5",
  };
  return (
    <span className={`rounded-md border px-2 py-0.5 font-mono text-2xs ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Explorer({
  address,
  children,
}: {
  address: string;
  children?: React.ReactNode;
}) {
  return (
    <Link
      href={`https://explorer.solana.com/address/${address}?cluster=devnet`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 font-mono text-2xs text-muted transition-colors hover:text-chalk"
    >
      {children || `${address.slice(0, 4)}…${address.slice(-4)}`}
      <ArrowUpRight className="h-3 w-3" aria-hidden />
    </Link>
  );
}

export function Note({ children }: { children: React.ReactNode }) {
  return <p className="max-w-prose text-sm leading-relaxed text-muted">{children}</p>;
}

export function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="font-mono text-2xs leading-relaxed text-red-400">
      {children}
    </p>
  );
}

/** Fades a block in the first time it scrolls into view. */
export function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const shown = useOnScreen(ref);
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: 18 }}
      animate={shown ? { opacity: 1, y: 0 } : undefined}
      transition={{ ...easeEnter, delay }}
    >
      {children}
    </motion.div>
  );
}

/** Staggered container for lists that appear together. */
export function StaggerList({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const shown = useOnScreen(ref);
  return (
    <motion.div
      ref={ref}
      className={className}
      variants={reduce ? undefined : stagger()}
      initial={reduce ? undefined : "hidden"}
      animate={reduce || shown ? "show" : "hidden"}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} variants={reduce ? undefined : riseIn}>
      {children}
    </motion.div>
  );
}
