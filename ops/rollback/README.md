# Rollback

The program that was live on devnet before the escrow work started, kept so a
bad upgrade costs ten seconds instead of an evening.

It lived in `/tmp` for a day, which is not a place to keep the only copy of
anything. Worse, the copy there was the *pre-session-keys* build: restoring it
would have taken the deployed program backwards past a feature the site
already depends on, which is the kind of rollback that makes things worse.
This one was checked against the chain — `solana program dump` returned the
account, and its first 488,776 bytes hash identical to `grabable-v1.so`. The
remaining 8,368 bytes of the account are zeros, which is all the headroom
there is.

| File | What it is |
|---|---|
| `grabable-v1.so` | The program deployed at `5VBYCgd…Nq9R` as of 9 Sep 2026, 01:53 |
| `grabable-v1.idl.json` | The IDL that matches it. A rollback without its IDL is not a rollback |
| `MANIFEST.sha256` | Both hashes, so a restore can be checked rather than hoped |

## Restoring

```bash
sha256sum -c ops/rollback/MANIFEST.sha256
solana program deploy ops/rollback/grabable-v1.so \
  --program-id 5VBYCgdVwAELHuCwQgTXDB7czV9wvz65gYN3bCR9Nq9R \
  --url devnet
cp ops/rollback/grabable-v1.idl.json frontend/lib/idl.json
git checkout grabable-v1 -- frontend/ scripts/
```

The last line matters as much as the first: the deployed program and the code
that talks to it move together, and half a rollback is a site calling
instructions that no longer exist.

## Room to grow

The program account holds 497,144 bytes and the binary uses 488,776 of them.
Anything that makes the program bigger than that headroom needs the account
extended **before** the upgrade will land:

```bash
solana program extend 5VBYCgdVwAELHuCwQgTXDB7czV9wvz65gYN3bCR9Nq9R <bytes> --url devnet
```

Rent for the extra bytes is small — the whole 497 KB account holds 2.53 SOL —
but the upgrade fails outright without it, and it fails after the buffer has
already been paid for.
