# Ronda Ciega

**Blind stable matching on Solana.** You say who you want. Nobody ever learns that you said it.

Built for [MagicBlock Solana Blitz v8](https://build.magicblock.app/?stage=blitz) — theme
*Global Startup Village*.

> Status: in development (Sep 4–11, 2026). Not deployed yet.

---

## The idea in one paragraph

Matching people who want to work together is a broken-sincerity market: everyone has a private
ranking and almost nobody states it, because stating it is only costly if the other side doesn't
reciprocate. Gale–Shapley has solved this on paper since 1962, but it needs a trusted third party
to collect every preference list, run the algorithm, and never leak or sell those lists. Ronda
Ciega replaces that party with a **MagicBlock Private Ephemeral Rollup**: the lists are written to
accounts only their author can read, the algorithm runs inside the TEE, and the only thing that
ever becomes public is the final set of pairings.

## Why this needs a Private ER and not a commit-reveal

Commit-reveal gives you secrecy **until a deadline** — verification requires publishing the
preimage. A preference list has to stay secret **permanently**: if it comes out at settlement that
you ranked someone seventh, the social cost the mechanism was designed to remove has merely
arrived late.

So the requirement is real computation over state that no external observer can read, ever. That's
what the Private ER provides, and it's the load-bearing reason this project exists.

Full argument in [`docs/SPEC.md`](docs/SPEC.md).

## How it runs

Gale–Shapley proceeds in proposal rounds, so the program executes **one round per rollup
transaction**. Each tick is O(n) and tiny; at ~10 ms per block a whole matching resolves in under
a second with every intermediate state observable. The thing that could have been a compute-budget
problem is instead the thing that makes it watchable.

Ties — two proposers a receiver never ranked — are broken with **MagicBlock VRF**, published so
anyone can replay the result without seeing a single preference.

## Privacy model, stated honestly

The Private ER is **TEE-enforced access control, not encryption**. Accounts are ordinary rollup
state that the TEE refuses to serve to anyone outside the permission's member list. The guarantee
is hardware-backed, not cryptographic. Known limits are listed in
[`docs/SPEC.md`](docs/SPEC.md) §7.

## Stack

| | |
|---|---|
| Program | Anchor `1.0.2`, `ephemeral-rollups-sdk` `0.16.2` |
| Chain | Solana Devnet |
| Rollup | MagicBlock TEE ER — `https://devnet-tee.magicblock.app` |
| Frontend | Next.js (pending) |

## Build

`anchor build` panics on native Windows (a `cargo-build-sbf` bug), so the Makefile drives
`cargo build-sbf` per program instead:

```bash
make build    # compile the program
make idl      # generate IDL + TS types
```

There is no local validator: `solana-test-validator` doesn't run natively on Windows either, so
everything targets devnet.

## Layout

```
programs/ronda-ciega/   Anchor program (state, Gale–Shapley tick, permissions)
docs/SPEC.md            The full design argument
```
