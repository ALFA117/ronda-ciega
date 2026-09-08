"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Check, Copy, Heart, HeartOff, Users } from "lucide-react";
import { ParticipantAccount, RoundAccount } from "@/lib/program";
import { currentStep, isBystander, partnerIndex, type StepId } from "@/lib/steps";
import { hasTeeSession } from "@/lib/tee";
import { sessionState } from "@/lib/session";
import { useT } from "@/lib/i18n";
import { JoinForm } from "./JoinForm";
import { RankingBuilder } from "./RankingBuilder";
import { Button, Label, Note, Panel } from "./ui";

const WalletMultiButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false },
);

/**
 * The one panel a participant actually needs, at the top of the round.
 *
 * Before this, a round page was a stack of six panels — the theater, the trace
 * check, the privacy check, the operator controls — and the single control the
 * visitor came to use was somewhere underneath. Everything above it is proof
 * aimed at a sceptic, which is the right content for the page and the wrong
 * thing to meet a participant with. Reported as "muy laborioso": it was, but
 * the work was scrolling and guessing, not signing.
 *
 * So the participant's own path gets stated as a rail of five steps with the
 * current one open, and the proof panels move below it. The rail is also the
 * honest answer to "how much more of this is there" — a question the old page
 * never answered anywhere.
 */

export function YourStep({
  round,
  participants,
  delegated,
  onChanged,
}: {
  round: RoundAccount;
  participants: ParticipantAccount[];
  delegated: boolean;
  onChanged: () => void;
}) {
  const wallet = useWallet();
  const { connection } = useConnection();
  const t = useT();

  const me = participants.find(
    (p) => wallet.publicKey && p.wallet.equals(wallet.publicKey),
  );

  // How many wallet prompts sealing a list will cost.
  //
  // Two caches decide it now, not one: the enclave token in localStorage, and
  // the session token on L1. With both, sealing costs nothing at all — the
  // session key signs the transaction and the enclave already knows who you
  // are. With neither it is two. The cheap direction is the dangerous one to
  // get wrong: promising a free action and then opening somebody's wallet is
  // worse than never having promised.
  const [enclave, setEnclave] = useState(false);
  const [session, setSession] = useState(false);
  // What this session watched happen. See StepInput.sealed: there is no
  // cheap way to ask the chain whether THIS wallet has a list, and the
  // question the round can answer — how many lists exist — is a different
  // one that used to be answered in this one's place.
  const [sealedByMe, setSealedByMe] = useState(false);
  useEffect(() => {
    let live = true;
    setEnclave(hasTeeSession(wallet.publicKey ?? null));
    if (!wallet.publicKey) {
      setSession(false);
      return;
    }
    sessionState(connection, wallet.publicKey).then((state) => {
      if (live) setSession(state === "live");
    });
    return () => {
      live = false;
    };
  }, [wallet.publicKey, connection, round.rankingCount, delegated]);

  const prompts = (enclave ? 0 : 1) + (session ? 0 : 1);

  // The side this person did NOT join is the one they will rank, and an
  // empty one is why somebody ends up staring at a form they cannot use.
  const oppositeCount = me
    ? participants.filter((p) => p.side !== me.side).length
    : 0;

  const state = {
    open: round.status === "open",
    connected: !!wallet.publicKey,
    joined: !!me,
    delegated,
    oppositeCount,
    sealed: sealedByMe,
  };
  const current: StepId = currentStep(state);

  // A closed round has no journey left to walk. Showing the rail there invited
  // a visitor to "Join" a round that cannot be joined — the panel promising
  // the one thing the program is guaranteed to refuse. So on a closed round the
  // rail appears only for someone who actually walked it, and everyone else
  // gets the single sentence that applies to them.
  if (isBystander(state)) {
    return (
      <Panel className="space-y-4 p-5">
        <Label>{t.steps.closedTitle}</Label>
        <p className="text-sm leading-relaxed text-muted">
          {wallet.publicKey ? t.steps.notInRound : t.steps.connectClosed}
        </p>
        {!wallet.publicKey && <WalletMultiButton />}
      </Panel>
    );
  }

  // The rail never shows "wait" or "alone" as stations of their own: both are
  // the ranking station, just not reachable yet — one because the round is not
  // on the rollup, the other because there is nobody to rank. Dots that
  // sometimes mean one thing and sometimes another are worse than fewer dots.
  const rail: { id: StepId; name: string }[] = [
    { id: "connect", name: t.steps.connect.name },
    { id: "join", name: t.steps.join.name },
    {
      id: "rank",
      name: sealedByMe ? t.steps.sealed.name : t.steps.rank.name,
    },
    { id: "result", name: t.steps.result.name },
  ];
  const station: StepId =
    current === "wait" || current === "alone" || current === "sealed"
      ? "rank"
      : current;
  const railIndex = rail.findIndex((s) => s.id === station);

  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge px-5 py-3.5">
        <Label>{t.steps.title}</Label>
        <span className="tnum font-mono text-2xs text-muted">
          {railIndex + 1} {t.steps.of} {rail.length}
        </span>
      </div>

      {/* The rail. Each station is a dot and a word; done ones carry a tick so
          progress reads without relying on colour alone. */}
      <ol className="flex items-center gap-1 px-5 py-4 sm:gap-2">
        {rail.map((s, i) => {
          const done = i < railIndex;
          const here = i === railIndex;
          return (
            <li key={s.id} className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
              <span
                aria-current={here ? "step" : undefined}
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] transition-colors ${
                  done
                    ? "border-sealed/50 bg-sealed/15 text-sealed"
                    : here
                      ? "border-sealed bg-sealed text-onSealed"
                      : "border-edge text-dim"
                }`}
              >
                {done ? <Check className="h-3 w-3" aria-hidden /> : i + 1}
              </span>
              {/* Four station names do not fit on one line at 375px — they
                  truncate to "Seal a l…", which is worse than not showing
                  them. Below sm only the station you are standing on keeps
                  its name; the rest are dots, and "n of 4" in the header says
                  how far along they are. */}
              <span
                className={`truncate font-mono text-2xs ${
                  here ? "inline text-chalk" : "hidden sm:inline"
                } ${done ? "sm:text-muted" : here ? "" : "sm:text-dim"}`}
              >
                {s.name}
                {done && <span className="sr-only"> — {t.steps.done}</span>}
              </span>
              {i < rail.length - 1 && (
                <span
                  aria-hidden
                  className={`hidden h-px flex-1 sm:block ${
                    done ? "bg-sealed/40" : "bg-edge"
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>

      <div className="space-y-4 border-t border-edge px-5 py-5">
        <div className="space-y-1.5">
          <p className="text-sm leading-relaxed">{t.steps[current].now}</p>
          {current === "rank" && (
            <SignatureCost prompts={prompts} session={session} />
          )}
          {current === "sealed" && (
            <p className="font-mono text-2xs leading-relaxed text-muted">
              {t.steps.sealed.next}
            </p>
          )}
        </div>

        {current === "connect" && <WalletMultiButton />}

        {current === "join" && (
          <JoinForm round={round} delegated={delegated} onJoined={onChanged} />
        )}

        {(current === "rank" || current === "sealed") && me && (
          <RankingBuilder
            round={round}
            me={me}
            participants={participants}
            onSubmitted={() => {
              setEnclave(hasTeeSession(wallet.publicKey ?? null));
              setSession(true);
              setSealedByMe(true);
              onChanged();
            }}
          />
        )}

        {current === "alone" && me && (
          <Alone
            side={me.side}
            needed={Math.max(round.minPerSide, 1)}
          />
        )}

        {current === "wait" && me && (
          <Note>
            {t.steps.youAre} <span className="text-chalk">{me.handle}</span>.
          </Note>
        )}

        {current === "result" && (
          <Outcome round={round} participants={participants} me={me} />
        )}
      </div>
    </Panel>
  );
}

/**
 * Joined, on the rollup, and alone on your side of the market.
 *
 * There is nothing to rank and no button that will work, so the only useful
 * thing this panel can do is say that plainly and hand over the link that
 * fixes it. Reported from a real round: the rail said "seal a list", the form
 * said there was nobody to rank, and neither said the round needed other
 * people or how to get them there.
 */
function Alone({ side, needed }: { side: "founder" | "builder"; needed: number }) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access is refused in plenty of ordinary situations — an
      // insecure origin, a browser setting, a page without focus. Selecting
      // the address bar is the fallback everybody already knows, so say that
      // rather than fail silently or pretend it worked.
      window.prompt(t.steps.copyManually, url);
    }
  };

  return (
    <div className="space-y-4">
      <div className="glass flex items-start gap-3 rounded-xl px-4 py-3.5">
        <Users className="mt-0.5 h-4 w-4 shrink-0 text-open" aria-hidden />
        <p className="text-xs leading-relaxed text-muted">
          {(side === "founder" ? t.steps.aloneFounder : t.steps.aloneBuilder).replace(
            "{n}",
            String(needed),
          )}
        </p>
      </div>

      <Button variant="sealed" onClick={share}>
        <Copy className="h-3.5 w-3.5" aria-hidden />
        {copied ? t.steps.copied : t.steps.copyInvite}
      </Button>
    </div>
  );
}

/**
 * How many prompts the next action costs, said before it costs them.
 *
 * Two on a cold browser: one authorising a session key, one proving to the
 * enclave who you are. Both are cached — the session key on chain, the enclave
 * token in this browser — so the count falls to one and then to none, and the
 * reason is named each time. A wallet popping up twice for reasons is a
 * different experience from a wallet popping up twice.
 */
function SignatureCost({
  prompts,
  session,
}: {
  prompts: number;
  /** Which of the two is already done decides which reason is left to give. */
  session: boolean;
}) {
  const t = useT();

  const count =
    prompts === 0
      ? t.steps.signaturesNone
      : prompts === 1
        ? t.steps.signaturesOne
        : t.steps.signaturesTwo;

  const why =
    prompts === 0
      ? t.steps.signaturesWhyNone
      : prompts === 2
        ? t.steps.signaturesWhyTwo
        : session
          ? t.steps.signaturesWhyEnclave
          : t.steps.signaturesWhySession;

  return (
    <p className="font-mono text-2xs text-muted">
      <span className="text-sealed">{count}</span> · {why}
    </p>
  );
}

/** The answer, for the person who came for the answer. */
function Outcome({
  round,
  participants,
  me,
}: {
  round: RoundAccount;
  participants: ParticipantAccount[];
  me?: ParticipantAccount;
}) {
  const t = useT();
  if (!me) return null;

  // pairs is indexed by founder, so a builder has to be looked up the other
  // way round. Getting this backwards silently tells half the round they were
  // unmatched, which is why it is spelled out rather than inlined.
  const partnerIdx = partnerIndex(round.pairs, me.side, me.index);
  const partner =
    partnerIdx === null
      ? undefined
      : participants.find((p) => p.side !== me.side && p.index === partnerIdx);

  if (!partner) {
    return (
      <div className="flex items-center gap-2.5 font-mono text-sm text-muted">
        <HeartOff className="h-4 w-4 shrink-0" aria-hidden />
        {t.steps.unmatched}
      </div>
    );
  }

  return (
    <div className="glass glass-sealed flex items-center gap-3 rounded-xl px-4 py-3.5">
      <Heart className="h-4 w-4 shrink-0 text-sealed" aria-hidden />
      <div className="min-w-0">
        <p className="font-mono text-2xs text-muted">{t.steps.matchedWith}</p>
        <p className="truncate font-mono text-base text-chalk">{partner.handle}</p>
      </div>
    </div>
  );
}
