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
      className={`surface-raised rounded-2xl border ${
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

/**
 * Glass button.
 *
 * Press is a spring rather than a duration so it interrupts cleanly when
 * someone taps twice, and the scale stays inside 0.95–1.05 — bigger reads as
 * janky on a touch screen where the finger already covers the control. The
 * colour lives *in* the glass, so it reads as lit rather than painted.
 *
 * Default height is 44px on touch and 40px from `sm` up: the touch minimum
 * matters on the device that has fingers, not on the one with a cursor.
 */
export function Button({
  children,
  onClick,
  disabled,
  busy,
  variant = "primary",
  type = "button",
  full = false,
  size = "md",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: "primary" | "ghost" | "sealed" | "open";
  type?: "button" | "submit";
  full?: boolean;
  size?: "sm" | "md";
}) {
  const reduce = useReducedMotion();

  const tint = {
    primary: "glass-sealed text-chalk",
    sealed: "glass-sealed text-chalk",
    open: "glass-open text-chalk",
    ghost: "text-chalk",
  }[variant];

  const dims =
    size === "sm" ? "h-10 px-3.5 text-2xs sm:h-9" : "h-11 px-5 text-sm sm:h-10";

  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      whileHover={reduce || disabled ? undefined : { scale: 1.02 }}
      whileTap={reduce || disabled ? undefined : { scale: 0.96 }}
      transition={springSnappy}
      className={`glass ${tint} ${dims} inline-flex min-w-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl font-mono transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        full ? "w-full" : ""
      }`}
    >
      {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
      {children}
    </motion.button>
  );
}

/** Square glass control for an icon. Meets the 44px touch minimum. */
export function IconButton({
  children,
  onClick,
  label,
  active = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  active?: boolean;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      onClick={onClick}
      aria-label={label}
      title={label}
      whileHover={reduce ? undefined : { scale: 1.05 }}
      whileTap={reduce ? undefined : { scale: 0.93 }}
      transition={springSnappy}
      className={`glass ${
        active ? "glass-sealed text-chalk" : "text-muted hover:text-chalk"
      } flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl sm:h-10 sm:w-10`}
    >
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

/** Fades a block in the first time it is on screen. */
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
      // Displacement only: content this wraps must be readable whether or not
      // the animation ever runs. See lib/motion.ts.
      initial={{ y: 18 }}
      animate={shown ? { y: 0 } : undefined}
      transition={{ ...easeEnter, delay }}
    >
      {children}
    </motion.div>
  );
}

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
