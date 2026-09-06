# Ronda Ciega

**Blind stable matching on Solana.** You say who you want. Nobody ever learns that you said it.

Built for [MagicBlock Solana Blitz v8](https://build.magicblock.app/?stage=blitz) — theme
*Global Startup Village*.

**Live:** [ronda-ciega.vercel.app](https://ronda-ciega.vercel.app) · Solana **Devnet**

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

Storing the **inverse** of each receiver's ranking (`builder_rank[b][f]` = founder *f*'s position in
builder *b*'s list) is what keeps each round O(n): deciding whether a builder prefers a new proposer
over the one they're holding is one array lookup, not a scan.

## Verifiable tie-breaks

Gale–Shapley assumes strict orders. When a receiver ranked neither of two proposers, something has
to break the tie — and breaking it by account index would quietly reward whoever registered first,
which is exactly the bias the system claims to remove.

Ties are broken with **MagicBlock VRF**, requested against the ephemeral queue when the round is
delegated. **Matching refuses to run until the callback lands** — `run_matching` and `tick` both
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
| Demo round, **transparent** | [`58o6gi9yBdFgyRhC7Kf5PhgKTaJKrCN89P6h1gu6RW8x`](https://ronda-ciega.vercel.app/round/58o6gi9yBdFgyRhC7Kf5PhgKTaJKrCN89P6h1gu6RW8x) — 4×4, VRF fulfilled, settled in 3 rounds, committed back to L1. Records its frames, so the algorithm can be watched resolving. |
| Demo round, **private** | [`3LkgsGPQWqngarMVBzoLjgH1ocQuLTcftU7qwrig652p`](https://ronda-ciega.vercel.app/round/3LkgsGPQWqngarMVBzoLjgH1ocQuLTcftU7qwrig652p) — the same eight people, the same rankings, the **same pairing**, and zero recorded frames. Read these two side by side: identical answer, no visibility into how. |
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
