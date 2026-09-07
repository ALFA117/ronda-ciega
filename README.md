# Ronda Ciega

**Blind stable matching on Solana.** You say who you want. Nobody ever learns that you said it.

Built for [MagicBlock Solana Blitz v8](https://build.magicblock.app/?stage=blitz) — theme
*Global Startup Village*.

**Live:** [ronda-ciega.vercel.app](https://ronda-ciega.vercel.app) · Solana **Devnet**

[![CI](https://github.com/ALFA117/ronda-ciega/actions/workflows/ci.yml/badge.svg)](https://github.com/ALFA117/ronda-ciega/actions/workflows/ci.yml)

---

## Why this can't be a commit-reveal

This is the argument the whole project rests on, so it goes first.

A commit-reveal buys secrecy **until a deadline**. You publish a hash, and at the deadline you
publish the preimage so anyone can check you didn't change your answer. Verification *requires*
revelation — the secret has an expiry date by construction.

A preference list cannot work that way. It has to stay secret **permanently**. If it comes out at
settlement that I ranked you seventh, the social cost the mechanism was designed to remove has
simply arrived late. And if it never comes out, nobody can verify the result.

So the requirement is real computation over state that no external observer can read, ever. That
is what a **MagicBlock Private Ephemeral Rollup** provides, and it is the load-bearing reason this
project exists rather than a nicer way to do something you could already do.

## What it does

Gale–Shapley has solved stable matching on paper since 1962. The reason it isn't used outside
institutions — medical residency matching, school admissions — is that it needs a **trusted third
party** to receive every preference list, run the algorithm, and never leak or sell those lists.
That party rarely exists.

Ronda Ciega replaces it with an enclave:

1. **You join a round** on one side of the market — `founder` (product, go-to-market) or `builder`
   (technical). Your profile is public. It's the same information you'd already publish in a
   builder directory.
2. **You seal a ranking** of the other side. The account is created *inside* the rollup, behind a
   permission whose only wallet member is you, and it is closed there without ever being committed
   to L1.
3. **The round closes** at its deadline and the rankings are ingested into private working memory.
4. **The algorithm runs** inside the TEE, in a single rollup transaction.
5. **Only the pairings are published.**

## Check it rather than believe it

Three things run in your browser, against public data, with no wallet:

- **[/proof](https://ronda-ciega.vercel.app/proof)** generates four hundred markets, runs the same
  matching implementation the chain runs, and searches every result for a blocking pair — two people
  who would both rather leave their match for each other. One is enough to make the whole promise
  false. Half the markets carry complete lists and half are cut short, and that split is the point:
  Gale–Shapley consults the tie-break only when a receiver has ranked *neither* of two proposers, so
  an all-complete sweep executes `break_tie` exactly zero times. It used to be all-complete, which
  left the branch the VRF exists to protect outside the guarantee this page presents.
  *400 markets, 0 blocking pairs, 172 of them able to reach the tie-break, ~30 ms.*
- **Any settled transparent round** publishes its full trace, and the round page recomputes it
  against what the chain says: no builder held twice, every index real, the pair count never
  falling, the trace ending exactly where Solana says it ended.
- **Every round** derives the deterministic address of each preference list and goes looking for
  them on both chains, from your browser — **with the two controls that make an absence mean
  anything**. The panel asks L1 for the round's public account and gets it; asks the rollup for the
  same account over a connection carrying *no auth token* and gets it; then asks both for the
  lists and gets nothing. Without those first two rows a zero is indistinguishable from a query
  pointed at the wrong cluster, and the verdict refuses to read "shielded" unless they passed.
  *4 probes, 0 of 12 lists readable.*

The landing page's "0 preference lists published" is counted rather than asserted, by a
`getProgramAccounts` call whose exact `curl` is printed beside it, with the public profiles as the
control: a lone zero is indistinguishable from a broken query.

Section 01 is a playground: the algorithm running on lists you can reshuffle, stepping round by
round, ending with a live blocking-pair check. Same implementation, no wallet, no transaction. It
sits first because it used to sit fifth, behind three hundred words nobody scrolled past.

## Signing, and what a wallet cannot simulate

A wallet simulates every transaction against L1. Once a round is delegated its account no longer
lives there, so the simulation fails and the wallet warns or refuses — on its own dApp, for a
transaction that would have succeeded. This is inherent to ephemeral rollups, not a bug in the page.

None of the rollup instructions the operator sends check *who* signed: `close_round`,
`seal_preferences` and `tick` take no signer at all, and the rest take a `payer` never compared
against `round.authority`. So a round is driven by a local key kept in the browser, topped up once
by a plain L1 transfer, and the whole lifecycle runs without a prompt. `scripts/operator-key.ts`
proves the claim using a key the round has never heard of.

Identity deliberately does not move: `submit_ranking` stays bound to the participant's wallet.

The operator does not have to be there either. Running a round is three actions separated by two
waits — set it up, settle it once the deadline has passed and the oracle has answered, then destroy
the private accounts and hand the round back to L1 — and nobody is at the keyboard when a deadline
passes at three in the morning. Every one of those steps is already sent by the local key, so the
only thing that ever required a person was the click. **Autopilot** does the clicking: it reads the
round, runs whatever is possible, waits out what is not, re-sends a randomness request that never
landed (rate-limited, so a stuck oracle cannot drain the key), and disarms itself after three
refusals rather than retrying a permanent one forever. It runs in a browser tab and the UI says so,
because a round left half-settled by a closed laptop is recoverable only if nobody was told
otherwise. `lib/autopilot.ts` decides the sequence and is tested on its own — settling a moment
early wastes a transaction, and finishing a moment early destroys the working memory of a round
that has not produced its pairings yet.

A participant still signs, and the page now says how often before it asks. The enclave's auth
challenge is one prompt and the transaction is the other, so a cold browser costs two; the token is
valid for hours and survives reloads, so everything after that costs one. It used to be two every
time, because the token lived in a module-level Map that every page load threw away. Disconnecting
clears it.

## How it runs

Gale–Shapley proceeds in proposal rounds, so the program executes them as a loop inside **one
rollup transaction**, recording a frame per round. A remote client cannot make N sequential
transactions quickly — each depends on the last — but it can make one transaction that does N
rounds.

Measured against devnet from Mexico:

| | |
|---|---|
| One transaction, whole matching | **671 ms** wall clock (one round-trip) |
| One transaction per proposal round | 0.9–1.6 s **each** |

That gap is network latency, not rollup execution. The rollup produces blocks every ~10 ms; the
internet does not.

Those two rows were measured once, by me. The landing page also carries a **live** version: both
endpoints are asked for their slot height about once a second from the reader's own browser, and
the rate is derived from what they answer rather than typed into the page. Around 3.3× as fast,
and if the TEE endpoint is down that lane says so in front of everyone instead of the page
carrying on claiming 671 ms.

Storing the **inverse** of each receiver's ranking (`builder_rank[b][f]` = founder *f*'s position in
builder *b*'s list) is what keeps each round O(n): deciding whether a builder prefers a new proposer
over the one they're holding is one array lookup, not a scan.

## Verifiable tie-breaks

Gale–Shapley assumes strict orders. When a receiver ranked neither of two proposers, something has
to break the tie — and breaking it by account index would quietly reward whoever registered first,
which is exactly the bias the system claims to remove.

Ties are broken with **MagicBlock VRF**, requested against the ephemeral queue when the round is
delegated. The callback takes the first answer and refuses the rest: two requests can be in flight
before either lands, and a second one overwriting the seed after the round was matched would leave
the pairings published beside a seed that does not reproduce them — the one thing a replayable
tie-break cannot survive. Live on devnet, and `negative:rollup` asks twice to prove it. The playground makes that arguable rather than asserted: reroll the tie-break on the
same lists and the page counts how many of twenty-five seeds produce a different pairing. Often the
answer is none — Gale-Shapley needs a tie-break only when a receiver has ranked *neither* of two
proposers — and saying so is more convincing than implying the seed always matters. When it does
matter, it decided somebody's match. **Matching refuses to run until the callback lands** — `run_matching` and `tick` both
return `RandomnessMissing` rather than settling a round on registration order. The seed is published on the round,
so anyone can replay every tie-break without seeing a single preference.

## Transparent rounds, and why they're opt-in

Found while building, not while designing: **animating the algorithm leaks preferences.** If round 1
shows that founder 0 proposed to builder 2, that publishes founder 0's first choice. The full
sequence of proposals and rejections reconstructs much of everyone's ranking.

So a round carries a `transparent` flag, decided at creation:

- **Transparent** — records a snapshot per round, so the algorithm can be watched resolving. For
  demos, or rounds where every participant agreed to it.
- **Normal** — intermediate states never leave the enclave. Only the final pairings are published.

The UI presents this as a disclosure, not a display toggle.

The rule is one condition inside the matching loop, and it is the privacy claim
that lives there: a misplaced `&&` would publish the proposal sequence for
every round ever run, and the account would look entirely ordinary. Nothing
checked it until the Rust tests existed. `a_private_round_records_no_frames_at_all`
does now, on a market chosen to take several rounds so there is a sequence
worth leaking — deleting the `transparent &&` makes exactly that test fail,
which is how I know it is a real check and not a shape.

## The privacy model, stated honestly

The Private ER is **TEE-enforced access control, not encryption**. Accounts are ordinary rollup
state that the enclave refuses to serve to anyone outside the permission's member list. The
guarantee is hardware-backed, not cryptographic.

Verified live on devnet, and reproducible with `scripts/spike.ts`:

```
── THE GATE — can an outsider read someone's preferences?
   ok  owner CAN read their own preferences (92 bytes)
   ok  outsider got nothing back — account is shielded
   ok  control: the same outsider connection CAN read the public round (512 bytes)
   ok  unauthenticated RPC returned nothing
```

The control line matters more than the refusal. Without it, "got nothing back" would prove nothing —
it could just mean that connection can't see rollup accounts at all. The same outsider connection
reads the *public* round account fine, so the empty result is the permission working.

### What this does not promise

- **The result leaks, by design.** If you end up matched with me, you know you were on my list.
  That's the product.
- **A small pool leaks by elimination.** With four people per side, the pairings say a lot about the
  rest. Rounds enforce a minimum.
- **No identity verification.** One human can register several wallets. Out of scope for a one-week
  build.

## On chain

| | |
|---|---|
| Program | [`5VBYCgdVwAELHuCwQgTXDB7czV9wvz65gYN3bCR9Nq9R`](https://explorer.solana.com/address/5VBYCgdVwAELHuCwQgTXDB7czV9wvz65gYN3bCR9Nq9R?cluster=devnet) |
Both demo rounds ran the full lifecycle, closing included: their rankings and working memory were
destroyed inside the enclave before the round was committed back.

| Demo round, **transparent** | [`7QtvEoTWT69VVyYHrwigmLcTevZtLfcavEWD8WdnqKq4`](https://ronda-ciega.vercel.app/round/7QtvEoTWT69VVyYHrwigmLcTevZtLfcavEWD8WdnqKq4) — 4×4, VRF fulfilled, settled in 3 rounds, committed back to L1. Records its frames, so the algorithm can be watched resolving. |
| Demo round, **private** | [`3HKShqud9GTngwHUbGDFrNFfFxBnFiJ8EQin9jw5JCs3`](https://ronda-ciega.vercel.app/round/3HKShqud9GTngwHUbGDFrNFfFxBnFiJ8EQin9jw5JCs3) — the same eight people, the same rankings, the **same pairing**, and zero recorded frames. Read these two side by side: identical answer, no visibility into how. |
| Rollup | MagicBlock TEE ER — `https://devnet-tee.magicblock.app` |
| VRF queue | `5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc` |

## Accounts

| Account | Visibility | Holds |
|---|---|---|
| `Round` | public, L1 | deadline, counts, pairings, VRF seed, transparency flag |
| `Participant` | public, L1 | wallet, side, handle, link |
| `Preferences` | **private, rollup only** | one person's ranking |
| `MatchState` | **private, rollup only** | every ranking, plus the algorithm's working state |

`Preferences` and `MatchState` are created inside the rollup and destroyed there by
`close_preferences` and `close_match_state`, which close the permission, close the account and
return the rent to the round that sponsored it. They are never delegated from L1 and never
committed to it — there is no instruction anywhere in the program that moves a ranking out of the
enclave.

Order matters: closing needs the round as its rent sponsor, and once the round is committed back
to L1 the rollup can no longer write it. Undelegating first orphans every ranking account inside
the enclave. The UI does both in one action so it cannot be got wrong by clicking.

Closing is permissionless once a round has settled. There is nothing to gain by calling it: the
data is unreadable to the caller either way, and destroying it is what the participant was
promised.

## Build

```bash
make build    # compile the program
make idl      # generate the IDL and TypeScript types
```

`anchor build` panics on native Windows (a `cargo-build-sbf` bug), so the Makefile drives
`cargo build-sbf` per program. There is no local validator either — `solana-test-validator` doesn't
run natively on Windows — so everything targets devnet.

```bash
npx ts-node scripts/spike.ts          # full round, end to end, with the privacy check
POOL=6 npx ts-node scripts/spike.ts   # bigger market
MODE=step npx ts-node scripts/spike.ts  # one transaction per proposal round
```

Frontend:

```bash
cd frontend && npm install && npm run dev
```

## Tests

CI runs everything that is deterministic and free — the unit suite, both type
checks, the Next build, the design invariants, and the program itself: rustfmt,
clippy, a host type check, forty Rust unit tests and the SBF build. That
last one matters more than it looks: `anchor build` panics on native Windows,
so until CI existed nothing verified a Rust change compiled until it was
deployed.

The Rust tests are newer than they should be. Everything that verified the
matching ran against the **TypeScript reimplementation** in the frontend — four
hundred generated markets per click, well covered — and nothing anywhere
checked that the two implementations agree. The one that decides who actually
gets matched is the Rust, and it was the one with no tests. Two of the cases
are **pinned vectors asserted in both languages**: the same lists, the same
seed, the same expected pairing, in `programs/ronda-ciega/src/lib.rs` and in
`frontend/tests/matching.test.ts`. A drift now turns one of the two suites red
instead of turning up as a devnet round that disagrees with the page explaining
it. The first version of that vector was expected by hand and was wrong — both
implementations disagreed with it in the same way, which is how it earned its
place.

```bash
cargo test --package ronda-ciega   # 40 tests, host target, no validator
```

```bash
cd frontend && npm test        # 183 unit tests, no network, ~1s
npm run test:types             # types for the test suite
OFFLINE=1 node scripts/verify.mjs   # the 46 checks that read the repo
```

The rest costs SOL and needs a funded devnet wallet, so it stays manual and out
of CI. A pipeline that goes red because devnet is having a bad day is one people
learn to ignore.

```bash
npm run verify                 # 54 checks, including the deployed site
npm run negative               # 11 refusals the program must make, on L1
npm run operator-key           # a stranger key drives the rollup lifecycle
npm run concurrency            # six wallets join at once, indices stay unique
FULL=1 npm run negative        # + SideFull: fills a side with 16 (~0.1 SOL)
npm run negative:rollup        # 26 refusals inside the TEE (~0.15 SOL, 3 min)
npm run spike                  # the full lifecycle, including the privacy gate
```

Two of those cases exist because of the same failure: something that is wrong
and silent. The stat band counted up on `requestAnimationFrame` and froze
mid-count in any tab that stopped compositing, leaving invented measurements on
screen in the same type as the real ones. And the round-length box ran its value
through `Number()` straight into the deadline — `Number("")` is `0` and
`new BN(NaN).toString()` is `"0"`, not a throw, so an empty box created a round
dated 1970: the transaction succeeded, and the round could never be joined by
anyone, with nothing on screen saying why. Neither logged an error. Both are now
checked from the browser.

Sixteen of the program's nineteen error codes are exercised. The three that are
not are documented in [docs/ROADMAP.md](docs/ROADMAP.md): one is unreachable
behind a seeds constraint, one is declared and never raised (its invariant is
enforced by a state transition instead), and one guards arithmetic on counters
that cannot overflow.

The seventeen UI cases run in the browser against any page of the deployed site.
Two of them wait on the network, so the run takes about ten seconds:

```js
new Function(await (await fetch("/ui-cases.js")).text())();
await runUiCases();
```

## Layout

```
programs/ronda-ciega/   Anchor program: state, Gale–Shapley, permissions, VRF
scripts/spike.ts        End-to-end run against devnet + the TEE rollup
frontend/               Next.js app (ES/EN, light/dark)
docs/SPEC.md            The full design argument
docs/PLAN.md            Remaining work
```

## Stack

Anchor `1.0.2` · `ephemeral-rollups-sdk` `0.16.2` · Solana Devnet · Next.js 14 · Motion

## License

MIT
