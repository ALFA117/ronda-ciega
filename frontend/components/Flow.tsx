"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRightLeft,
  Check,
  KeyRound,
  Lock,
  Send,
  Users,
  Wallet,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import { useOnScreen } from "@/hooks/useOnScreen";
import { enclaveSpan, FLOW, StepState, Tone } from "@/lib/flow";

const ICONS = {
  open: Send,
  join: Users,
  fund: Wallet,
  seal: Lock,
  match: KeyRound,
  result: Check,
  settle: ArrowRightLeft,
} as const;

/**
 * The two steps where money is on the line get their own colour.
 *
 * Not decoration. Cyan already means sealed and magenta means public, and a
 * deposit is neither — it is public, and yours, and not spendable. Painting it
 * in a role that already means something else would make the diagram argue for
 * something it does not say.
 */
const TONE = {
  neutral: {
    node: "border-sealed/55 bg-sealed/10 text-sealed",
    active: "border-sealed bg-surface text-sealed",
    label: "text-sealed",
  },
  escrow: {
    node: "border-escrow/55 bg-escrow/10 text-escrow",
    active: "border-escrow bg-surface text-escrow",
    label: "text-escrow",
  },
  settled: {
    node: "border-settled/55 bg-settled/10 text-settled",
    active: "border-settled bg-surface text-settled",
    label: "text-settled",
  },
} as const;

/* ------------------------------------------------------------------ nodes */

/**
 * One numbered node, in the one visual language the whole page uses for a
 * step. The map at the top and the rail you descend while opening a round
 * draw the same object in the same three states, which is the only reason
 * the second reads as "you are inside the first".
 */
function Node({
  n,
  state,
  icon,
  sealed,
  tone = "neutral",
  size = "md",
}: {
  n: number;
  state: StepState;
  icon?: ReactNode;
  /** Inside the enclave: hatched, so the boundary is visible on the node too. */
  sealed?: boolean;
  tone?: Tone;
  size?: "md" | "sm";
}) {
  const done = state === "done";
  const active = state === "active";
  const px = size === "md" ? "h-11 w-11" : "h-9 w-9";
  const paint = TONE[tone];

  return (
    <span
      className={`relative z-10 flex ${px} shrink-0 items-center justify-center rounded-xl border font-mono text-2xs transition-colors duration-500 ${
        sealed ? "sealed-hatch" : ""
      } ${
        done ? paint.node : active ? paint.active : "border-edge bg-surface text-dim"
      }`}
    >
      {/* A quiet ring on the step being answered. It pulses once on arrival
          rather than forever: a permanent pulse is a page that never settles. */}
      {active && (
        <motion.span
          aria-hidden
          className={`absolute inset-[-3px] rounded-[0.9rem] border ${
            tone === "escrow"
              ? "border-escrow/45"
              : tone === "settled"
                ? "border-settled/45"
                : "border-sealed/45"
          }`}
          initial={{ opacity: 0.9, scale: 0.94 }}
          animate={{ opacity: 0, scale: 1.12 }}
          transition={{ duration: 1.1, ease: "easeOut" }}
        />
      )}
      {icon ?? (
        done ? (
          <Check className="h-4 w-4" aria-hidden />
        ) : (
          <span className="tnum">{String(n).padStart(2, "0")}</span>
        )
      )}
    </span>
  );
}

/* -------------------------------------------------------------- the map */

/**
 * The five steps a round goes through, drawn once, right under the headline.
 *
 * This replaced three different tellings of the same sequence — an animated
 * graph here, a four-card diagram three sections down, a numbered list inside
 * the start panel — which between them used four steps, four other steps, and
 * about a screen and a half. A reader who noticed they disagreed had no way
 * to know which was the real shape.
 *
 * What the drawing has to carry is *where* each step happens, because that is
 * the entire argument: the two middle steps sit inside a marked region and
 * the line leaves L1 and comes back. Everything else is labelling.
 */
export function FlowMap() {
  const t = useT();
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const shown = useOnScreen(ref, -120);
  const span = enclaveSpan();

  // The steps light one after another once the diagram is on screen, so the
  // sequence reads as a sequence without anybody clicking through it. It
  // settles fully lit — nothing here depends on the animation having run.
  const [lit, setLit] = useState(reduce ? FLOW.length : 0);
  useEffect(() => {
    if (!shown || reduce) return;
    const id = setInterval(
      () => setLit((n) => (n >= FLOW.length ? (clearInterval(id), n) : n + 1)),
      380,
    );
    return () => clearInterval(id);
  }, [shown, reduce]);

  return (
    <div ref={ref} className="relative">
      <div className="mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-mono text-2xs uppercase tracking-[0.18em] text-sealed">
          {t.flow.label}
        </h2>
        <p className="text-xs text-muted">{t.flow.lede}</p>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-edge bg-surface/40">
        {/* The enclave region, drawn behind the steps that happen in it.
            On the wide layout it is a vertical band across two columns; on
            the narrow one it is a bar down the left of the same two rows. */}
        {span && (
          <>
            {/* Not animated in. It was, from opacity 0, and the standing UI
                case caught it within the hour: the boundary this figure
                exists to draw is exactly the thing that must not wait on a
                frame loop. The nodes lighting one by one already carry the
                sequence; the region is a fact and is simply there. */}
            <div
              className="sealed-hatch pointer-events-none absolute inset-y-0 z-10 hidden border-x border-dashed border-sealed/45 bg-sealed/[0.05] lg:block"
              style={{
                left: `${(span.from / FLOW.length) * 100}%`,
                width: `${((span.to - span.from + 1) / FLOW.length) * 100}%`,
              }}
            >
              <span
                aria-hidden
                className="absolute inset-x-0 top-3 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-sealed"
              >
                {t.flow.where.enclave}
              </span>
            </div>
          </>
        )}

        <ol className="relative z-20 grid lg:grid-cols-7">
          {FLOW.map((step, i) => {
            const Icon = ICONS[step.id];
            const copy = t.flow.steps[step.id];
            const inside = step.where === "enclave";
            const state: StepState = i < lit ? "done" : i === lit ? "active" : "ahead";

            return (
              <li
                key={step.id}
                className={`relative flex gap-4 p-5 lg:block lg:p-4 lg:pt-9 ${
                  i > 0 ? "border-t border-edge lg:border-l lg:border-t-0" : ""
                } ${inside ? "sealed-hatch bg-sealed/[0.05] lg:bg-transparent" : ""}`}
              >
                {/* The spine. Horizontal between nodes on the wide layout,
                    vertical down the gutter on the narrow one — the same line
                    either way, so the five stay one sequence and not five
                    cards that happen to touch. */}
                <span
                  aria-hidden
                  className={`absolute left-[2.4rem] top-[3.75rem] w-px bg-edge lg:left-0 lg:right-0 lg:top-[4.25rem] lg:h-px lg:w-auto ${
                    i === FLOW.length - 1 ? "hidden lg:block" : "bottom-0 lg:bottom-auto"
                  }`}
                />

                <div className="lg:mb-4">
                  <Node
                    n={i + 1}
                    state={state}
                    sealed={inside}
                    tone={step.tone}
                    icon={<Icon className="h-4 w-4" aria-hidden />}
                  />
                </div>

                <div className="min-w-0 space-y-1.5">
                  <div className="flex items-baseline gap-2">
                    <span className="tnum font-mono text-2xs text-dim">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h3 className="text-sm font-medium leading-snug">{copy.title}</h3>
                  </div>
                  <p className="max-w-[34ch] text-xs leading-relaxed text-muted lg:text-[11px]">
                    {copy.body}
                  </p>
                  <p
                    className={`font-mono text-[10px] uppercase tracking-[0.14em] ${
                      inside
                        ? "text-sealed"
                        : step.tone === "neutral"
                          ? "text-dim"
                          : TONE[step.tone].label
                    }`}
                  >
                    {inside ? t.flow.where.enclave : t.flow.where.l1}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- the rail */

export interface RailStep {
  title: string;
  body: string;
  /** Shown instead of the body once this step has an answer. */
  answer?: string;
  state: StepState;
  children?: ReactNode;
}

/**
 * The same nodes, descending, with the controls that answer each one.
 *
 * A form of three questions with a button at the bottom told somebody nothing
 * about what they were in the middle of, and the signature arrived as a
 * surprise. Drawn as a rail it says how many answers there are, which are
 * behind you, and that the last thing is a signature — before it asks for it.
 *
 * The line down the left fills as the answers arrive, so the rail is the
 * progress bar rather than carrying one.
 */
export function Rail({ steps }: { steps: RailStep[] }) {
  const reduce = useReducedMotion();

  return (
    <ol className="relative">
      {steps.map((s, i) => (
        <li key={s.title} className="relative flex gap-4 pb-7 last:pb-0">
          {/* The connector belongs to the step it leaves, drawn from under
              its node to the next one, and it fills when that step is
              answered. A single track spanning the whole list had to guess
              where the last node was and ran on past it through the sign
              button, which reads as "still going" at the exact moment the
              rail is trying to say "this is the end". */}
          {i < steps.length - 1 && (
            <span
              aria-hidden
              className="absolute bottom-0 left-[1.375rem] top-12 w-px bg-edge"
            >
              <motion.span
                className="absolute inset-0 origin-top bg-sealed/70"
                initial={false}
                animate={{ scaleY: s.state === "done" ? 1 : 0 }}
                transition={
                  reduce ? { duration: 0 } : { duration: 0.45, ease: [0.16, 1, 0.3, 1] }
                }
              />
            </span>
          )}

          <Node n={i + 1} state={s.state} />

          <div className="min-w-0 flex-1 space-y-2 pt-1.5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3
                className={`text-sm font-medium transition-colors ${
                  s.state === "ahead" ? "text-muted" : "text-chalk"
                }`}
              >
                {s.title}
              </h3>
              {s.answer && (
                <span className="tnum font-mono text-2xs text-sealed">{s.answer}</span>
              )}
            </div>

            {/* The explanation is for the step you are on. Behind you it is
                replaced by the answer you gave; ahead of you it is a title
                and nothing else, so the rail stays short enough to read. */}
            {s.state === "active" && (
              <p className="max-w-prose text-xs leading-relaxed text-muted">{s.body}</p>
            )}

            {s.children && <div className="pt-1">{s.children}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}
