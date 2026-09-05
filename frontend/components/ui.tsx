import Link from "next/link";

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
      className={`rounded-lg border ${
        sealed ? "border-sealed/30 sealed-hatch" : "border-edge"
      } bg-panel/60 ${className}`}
    >
      {children}
    </div>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[11px] uppercase tracking-widest text-muted">
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
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: "primary" | "ghost";
  type?: "button" | "submit";
}) {
  const base =
    "inline-flex h-9 items-center justify-center rounded-md px-4 font-mono text-[13px] transition disabled:cursor-not-allowed disabled:opacity-40";
  const styles =
    variant === "primary"
      ? "bg-chalk text-ink hover:bg-white"
      : "border border-edge text-chalk hover:border-muted";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      className={`${base} ${styles}`}
    >
      {busy ? "…" : children}
    </button>
  );
}

export function StatusPill({ status }: { status: string }) {
  const tone: Record<string, string> = {
    open: "border-open/40 text-open",
    sealing: "border-sealed/40 text-sealed",
    matching: "border-sealed/40 text-sealed",
    settled: "border-edge text-muted",
  };
  const label: Record<string, string> = {
    open: "abierta",
    sealing: "sellando",
    matching: "emparejando",
    settled: "cerrada",
  };
  return (
    <span
      className={`rounded border px-2 py-0.5 font-mono text-[11px] ${
        tone[status] || "border-edge text-muted"
      }`}
    >
      {label[status] || status}
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
      className="font-mono text-[11px] text-muted underline decoration-edge underline-offset-4 hover:text-chalk"
    >
      {children || `${address.slice(0, 4)}…${address.slice(-4)}`}
    </Link>
  );
}

export function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[13px] leading-relaxed text-muted">{children}</p>
  );
}
