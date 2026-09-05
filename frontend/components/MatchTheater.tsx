"use client";

import { useEffect, useState } from "react";
import { NONE } from "@/lib/constants";
import { framesFor, ParticipantAccount, RoundAccount } from "@/lib/program";
import { Label, Note, Panel } from "./ui";

/**
 * Replays the matching frame by frame.
 *
 * The frames come from the round's recorded history, not from transaction
 * logs — the TEE serves no logs for transactions that touch private accounts.
 * And the history only exists when the round is transparent, which is why a
 * private round shows its outcome and nothing else. That absence is the
 * product working, so the component says so rather than looking broken.
 */
export function MatchTheater({
  round,
  participants,
}: {
  round: RoundAccount;
  participants: ParticipantAccount[];
}) {
  const founders = participants.filter((p) => p.side === "founder");
  const builders = participants.filter((p) => p.side === "builder");
  const frames = framesFor(round);

  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing || frame >= frames.length - 1) return;
    const id = setTimeout(() => setFrame((f) => f + 1), 900);
    return () => clearTimeout(id);
  }, [playing, frame, frames.length]);

  useEffect(() => {
    setFrame(0);
    setPlaying(true);
  }, [round.historyLen, round.status]);

  const pairs = frames[Math.min(frame, frames.length - 1)] || [];
  const isFinal = frame >= frames.length - 1;

  const nameOf = (side: "founder" | "builder", idx: number) =>
    (side === "founder" ? founders : builders).find((p) => p.index === idx)
      ?.handle || `#${idx}`;

  return (
    <Panel className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <Label>
          {round.transparent ? "El algoritmo, ronda por ronda" : "Resultado"}
        </Label>
        {round.transparent && frames.length > 1 && (
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] text-muted">
              tick {Math.min(frame + 1, round.tick)} / {round.tick}
            </span>
            <button
              onClick={() => {
                if (isFinal) setFrame(0);
                setPlaying(!playing || isFinal);
              }}
              className="rounded border border-edge px-2 py-1 font-mono text-[11px] text-muted hover:text-chalk"
            >
              {isFinal ? "repetir" : playing ? "pausa" : "seguir"}
            </button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {founders.map((f) => {
          const b = pairs[f.index];
          const matched = b !== NONE && b !== undefined;
          return (
            <div
              key={f.address.toBase58()}
              className="grid grid-cols-[1fr_auto_1fr] items-center gap-4"
            >
              <div className="truncate text-right font-mono text-[13px]">
                {f.handle}
              </div>
              <div
                key={`${f.index}-${matched ? b : "none"}`}
                className={`settle w-24 text-center font-mono text-[12px] ${
                  matched ? "text-sealed" : "text-edge"
                }`}
              >
                {matched ? "───────" : "· · · · ·"}
              </div>
              <div
                className={`truncate font-mono text-[13px] ${
                  matched ? "" : "text-edge"
                }`}
              >
                {matched ? nameOf("builder", b) : "sin par"}
              </div>
            </div>
          );
        })}
      </div>

      {!round.transparent && (
        <Note>
          Esta ronda no es transparente, así que no hay nada que animar: los
          estados intermedios nunca salieron del enclave. Lo de arriba es todo
          lo que existe públicamente.
        </Note>
      )}

      {round.status === "settled" && (
        <Note>
          Emparejamiento estable. Las listas de preferencias siguen dentro del
          enclave y no se van a publicar nunca — no hay instrucción que las
          revele.
        </Note>
      )}
    </Panel>
  );
}
