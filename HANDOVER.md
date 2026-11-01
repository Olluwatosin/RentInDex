# Handover status

Working notes for the autonomous stretch that began 24 October 2026, while the
founder is away. Proposal: https://claude.ai/code/artifact/766643ee-81c8-4951-9f7a-fe5d907cd27d

The point of this file is that the state of the work should take thirty seconds
to read, not thirty minutes. Newest first.

## Blocked on you

- **The Supabase repository secrets.** `SUPABASE_URL` and
  `SUPABASE_SERVICE_ROLE_KEY` are still not set on the GitHub repo, so the
  weekly scrape has now failed on every scheduled run since 7 September 2026
  (7 of 7). Until they are set, the index cannot refresh. Either run
  `gh secret set SUPABASE_URL` / `gh secret set SUPABASE_SERVICE_ROLE_KEY`
  yourself, or say the word and I will — it means sending a production key to
  GitHub Actions, which is your call rather than mine.
- **Any spend**, **Meta business verification** for WhatsApp, and **anything
  that reaches a real person** (waitlist email, public posts, DNS). Unchanged
  from the proposal.

## Latest — 30 October

PR #2 (stacked on #1): the ask-when-thin flow, plus two things found building it.

**RentBot has produced zero renter rows in its entire life.** All 216 came from
the survey (207) and the form (9). Nothing could say why — every rejection
reason went to the console and this plan keeps runtime logs for one hour, so
"zero rows" and "zero users" looked identical. Web Analytics is not enabled
either. So the funnel is now tallied by outcome (`extraction_outcomes`, holding
no transcript, no rent figure, no conversation id) and reported by
`/api/health` and `npm run coverage`. Within days the question answers itself.

**The ask now names the cell.** `cell_progress()` reports how many renters have
reported an area-and-type and how many more it needs — something `rent_lookup`
cannot expose, because below the bar it returns the wider fallback and the
cell's own count vanishes. "2 renters have told me what they pay for a 2 bedroom
flat in Yaba. One more and I can give Yaba its own number." The variant shown to
someone who already gave their rent deliberately does not thank them or claim a
save, because the save happens later and can still be refused.

**And a correctness bug in the pricing engine.** `area_matches()` matched any
substring anywhere, including mid-word — `'nowhereville' LIKE '%vi%'` is true.
Live pairs being merged into one neighbourhood band: Ado→Badore (21 listings),
Idado, Alagbado, Agbado; Ojo→Ojodu Berger (11), Ojodu (9), Ojota; Aba→Yaba,
Asaba, Alaba. Ado is Lekki-adjacent, Agbado is far mainland; Ojo is past Trade
Fair, Ojodu Berger is Ikeja money. Fixed with a word boundary — length is the
wrong guard, since Uyo (97 listings), Jos, Apo, Ife and Ojo are real
three-letter place names. Measured first: of 450 areas, 10 change, 85 spurious
matches drop, 98.8% are kept, and every removed pair was an error.

Both migrations are **already applied to production** and verified there, since
the feature is inert without them.

### Worth your attention

- **There is no automated path from `supabase/migrations/` to production.** A
  Vercel deploy does not run migrations, so I applied these two by hand. The
  repo and the project are in step today; nothing keeps them that way except
  someone remembering. Worth a deploy step or a `supabase db push` in CI.
- **`areas.aliases` is still unused**, and now it has a job: "VI" for Victoria
  Island, and every other abbreviation renters actually type.

## The biggest thing I found

**The crowd half of the index is structurally dormant, and that is the
differentiator.** `npm run coverage` now measures it: 202 usable renter rows are
spread across 186 area-and-type cells — about 1.1 rows each — and `rent_lookup`
needs 3 in a cell before it will build an `actual` band. **Three cells in the
country clear that bar. None reach five.**

So in practice nearly every verdict in production is computed from *asking*
prices, and "high confidence" — which the engine defines as a typed, area-level
band built from what people actually pay — is unreachable. The code is not
wrong; there simply is not enough crowd data in any one place for it to fire.

The implication is strategic rather than technical: **the fix is concentration,
not volume.** One more submission everywhere leaves every cell under the bar.
Submissions have to be funnelled at cells that are already close — which is what
`npm run coverage -- --gaps` ranks, weighted by how much asking data sits there
to compare against. This moves "turn a thin answer into a question" from phase 3
to the most valuable thing on the list.

## Done

### Phase 2 — the index is refreshed, and coverage is now measured

- **Ran the Jiji scrape by hand** (it needs no GitHub secret). 1,457 listings
  parsed and written, Jiji going from 1,166 rows to 2,297. The index is now
  **4,046 rows, up from 2,915, and 0 days old** — the 53-day staleness is
  cleared and `/api/health` reads green.
- **`npm run coverage`** reports what share of real questions we can answer, per
  state, at both the engine's bar (n ≥ 3) and a credible one (n ≥ 5): currently
  **29% and 17%** of 1,245 area-and-type cells. `--gaps` ranks where the next
  submission would actually change an answer. Read-only, safe against production.
- A healthy Jiji run ends each short region on a 404, which was logged as a red
  `✗`. A normal run printed a dozen of them, and that is precisely how I came to
  misread the scraper as broken. Now logged as the end of results.

### Phase 1 — a net under the logic

- `supabase/migrations/` now holds the whole database: 8 tables, 24 indexes, 18
  constraints, the RLS posture and all 14 functions, `rent_lookup` included.
  Previously none of this was in the repository — it existed only inside the
  live Supabase project, with no history and no way back.
  Verified by rebuilding from nothing in a throwaway Postgres and comparing a
  151-line structural fingerprint against production: **identical**, including
  every function body.
- `npm test` — 59 unit tests over the pure logic. `tenancy.ts` is covered case
  by case, and every statute test names the section it encodes, so a failure
  says which provision the code stopped honouring.
- `npm run test:db` — 47 golden assertions on `rent_lookup`: the geography
  ladder, when the property-type filter gets dropped, actual-beats-asking,
  confidence grades, outlier exclusion, the `rent_estimate` trigger. They seed a
  state no real row uses and roll back, so they cannot touch real data.
- `.github/workflows/ci.yml` — typecheck, unit tests and build on every push,
  plus the database job, which also proves the migrations still apply cleanly to
  an empty database. That is the check that stops the repo drifting from the
  live project again.
- `tsx` added as a dev dependency: Node 20 cannot strip types natively.

### Phase 0 — making a dead pipeline impossible to miss

- The scrape workflow now opens (or updates) a GitHub issue on any failed
  scheduled run. It reuses one issue for an ongoing outage rather than filing a
  new one every Monday — fifty duplicate issues are as easy to ignore as none.
- `/api/health` gained a `dataFreshness` check: red when the newest listing is
  more than 14 days old, i.e. two missed weekly cycles. It reads 52 days right
  now, which is the alarm that should have sounded on 7 September.
- Workflow actions bumped to `@v5` / Node 22, clearing the deprecation warning
  on every run.

### Fixed along the way

- A rent rise too small to round to 1% was reported as "That is not an
  increase." ₦800,000 → ₦802,000 is a real increase and a renter might have
  acted on that. Found by writing the test for it.

## Corrected

- **Jiji is not broken.** I reported in the proposal that it "brings in almost
  nothing" on the strength of a `scrape_runs` row reading parsed 24, sent 0. That
  row was a single-page dry-run smoke test, taken right after run-logging was
  added. Jiji's real run predates that table, which is why it is absent from it.
  It has **1,166 rows in the index — 40% of the total**, and its API is healthy:
  HTTP 200, 8,856 Lagos listings available, response shape intact, 24 adverts a
  page. So the phase 2 work shrinks: Jiji needed running, not fixing.
  PropertyPro is still genuinely unbuilt (0 rows, no scraper).

## Flagged, not changed

- **s.4(1) is silent on quarterly and half-yearly sitting tenants.** It names
  only "a monthly tenant" (six months) and "a yearly tenant" (one year). The
  engine gives quarterly and half-yearly sitting tenants the one-year limit,
  which is an interpretation rather than something the statute says. Pinned by a
  test and left alone — it wants a lawyer's view, not my guess.
- **The `areas` table is unused.** Every `area_id` is null and `rent_lookup`
  matches on the raw text columns instead. Kept, because the normalisation it
  was built for is still worth doing.
- **`waitlist` holds zero rows.** Signups are meant to land there before being
  pushed to Brevo. Needs an end-to-end check that this is Brevo working rather
  than a signup path dropping people.
- **The README describes a product we no longer have** — Resend and Sheets as
  the primary stack, no mention of Supabase, the scrapers, the calculator or the
  rights engine. Next up, with a `CLAUDE.md` so each session stops re-deriving
  the architecture.

## Next, in order

1. Build the PropertyPro scraper — the third source, still missing. (Jiji needed
   no fix; see Corrected above.)
2. Deepen the NPC crawl on thin neighbourhoods — 181 of 963 area-and-type cells
   are at n ≥ 5, and a committed coverage report so that is a number we watch.
3. Wire market movement into the increase checker, so s.37(2)(a) is answered
   with evidence and not just cited.
4. Turn a thin-data answer into a question, so every gap collects crowd data.
5. Pidgin in RentBot; the WhatsApp adapter behind a provider interface.
