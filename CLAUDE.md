# Working on RentInDex

Read this before changing anything. `README.md` covers setup and the API; this
file is about the judgement calls that are easy to get wrong here.

## What this project is for

A renter is about to be overcharged, or has just been handed a notice, and needs
to know where they stand. Everything else follows from that. The product's only
real asset is being **right**, and being visibly right — which is why so much of
the code is about refusing to overstate what the data supports.

## The rules that are load-bearing

**Never widen a claim the data cannot carry.** A band built from a whole city is
labelled `city`, never presented as neighbourhood data. A band that lost its
property-type filter carries `any_type: true` and must never be quoted as a
price for the type the renter asked about — it mixes self-cons with duplexes.
Several commits in the history exist purely to undo violations of this rule
(`Stop reporting city-wide blends as neighbourhood rent data`, `Stop merging
every GRA into one invented neighbourhood`). Do not reintroduce one.

**Asking prices and actual rents are different datasets.** `listings_data` is
what landlords advertise; `renter_data` is what people report paying. The gap
between them *is* the product. Never average them together.

**Every legal answer quotes its section.** `app/lib/tenancy.ts` returns a
`Finding` with `citations`, each carrying the real wording. A renter arguing with
a landlord needs the statute, not our paraphrase.

**Never state law we have not read.** Only Lagos is encoded, from the Tenancy
Law 2011. Other states have their own Recovery of Premises laws which are *not*
the same. If asked to cover another state, the answer is to read that statute,
not to generalise from this one.

**The exemption travels with the finding.** s.1(3) exempts Apapa, Ikeja GRA,
Ikoyi and Victoria Island. An exempt-area renter must never be told their
landlord broke this Law — and because the share card is forwarded without the
page's banner, the qualification has to live inside the `Finding` itself. See
`qualifyForExcludedArea`. There is a test for this; keep it passing.

**RentBot must not poison its own dataset.** Extraction reads a transcript that
includes RentBot's own replies, and those replies quote our medians. A money
figure is only trusted if the *user* typed it — see `amounts.ts`
(`userTurnsOnly`, `amountCorroborated`). Without that check we publish a median,
read it back as a renter's rent, and start citing ourselves as evidence.

## The database is code

The pricing engine is a Postgres function, not TypeScript. `rent_lookup` and
thirteen others live in `supabase/migrations/`.

- **Change the schema with a migration file. Never in the Supabase dashboard.**
  These functions once existed only in the live project, with no history and no
  way back. The CI database job rebuilds from these files on every push, which is
  the only thing keeping the repo and the project in step.
- **RLS is on for every table with no policies, deliberately.** All access is
  server-side on the service role key. Adding a policy opens that table to the
  public internet. Do not add one to "fix" a permissions error — the fix is to
  go through the server.

## Before you commit

```bash
npm run typecheck && npm test && npm run build
```

And if you touched anything in `supabase/migrations/` or the SQL it tests:

```bash
DATABASE_URL=postgres://localhost/rentindex_test npm run test:db
```

Main stays green. If you cannot make it green, leave the work on a branch rather
than merging it.

## Conventions worth matching

**Comments explain why, not what.** The existing code says what a line is
defending against — a past outage, a specific wrong answer a renter got. Match
that. A comment restating the code earns nothing.

**Commit messages are prose that explains the decision.** Look at the log:
`Don't tell an Ikoyi renter their landlord broke a law that exempts them`,
`Stop RentBot poisoning its own dataset`. State the problem, then what you did
about it. Not `fix: tenancy bug`.

**Degrade, never crash.** No credential is required to boot. The LLM budget
running out is a *safe* state — RentBot composes verdicts deterministically. A
missing key is a runtime 503, never a failed build; every server module resolves
credentials lazily, and CI builds with no `.env` at all to keep it that way.

**Prefer a deterministic answer to a generated one.** Where a verdict can be
computed, compute it and hand the model the result to phrase. The model must not
be in a position to re-derive a number.

## Known shape of the problem

The index is thin and unevenly spread: roughly two thirds of it is Lagos and
Abuja, and only about a fifth of area-and-property-type combinations have five or
more listings behind them. The honest-gap handling in the UI is not a stopgap to
be removed — it is what makes the thin parts usable. When a cell is too thin to
answer, the right move is to *ask the renter for their number*, which is how the
crowd half of the dataset grows.

See `HANDOVER.md` for current state and what is blocked.
