# RentInDex

Nigeria's rent intelligence platform. It answers one question — **is this rent
fair?** — from real data, and a second one renters usually do not know to ask:
**what does the law actually say about this?**

Next.js 15 · TypeScript · Tailwind · Supabase (Postgres) · Groq

---

## What it does

| | |
|---|---|
| **The rent index** | Two separate datasets, never blended. *Asking* prices scraped from listing sites; *actual* rents reported by renters. The gap between them is the product. |
| **RentBot** | Conversational rent check. Answers from the index, falls back to deterministic replies when the LLM budget is spent, and collects data as it goes. |
| **Move-in cost calculator** | The true cost of moving in — agency, legal, caution, service charge, finder's fee — parsed from what renters actually reported paying. |
| **Know Your Rights** | A tenancy rules engine over the Lagos State Tenancy Law 2011. Every answer quotes the section it rests on, and the verdict card is built to be forwarded. |

Three things are load-bearing across all of it:

1. **A thin sample says it is thin.** A band built from a whole city is never
   labelled as neighbourhood data, and one that lost its property-type filter is
   never presented as a price for that type.
2. **Every legal answer carries its citation.** "A website said so" is worth
   nothing in an argument with a landlord; a quoted statute is worth a lot.
3. **We never state law we have not read.** Only Lagos is encoded. Other states
   have their own Recovery of Premises laws, and inventing them would be the
   exact failure this project exists to correct.

---

## Getting started

```bash
npm install
cp .env.example .env     # then fill it in — see below
npm run dev
```

http://localhost:3000. The site runs without credentials; the features that need
them degrade rather than crash.

### Checks

```bash
npm run typecheck
npm test                 # 59 unit tests — rules engine, parsers, geography
npm run build
```

The pricing engine lives in Postgres, so it has its own tests against a real
server. Point them at a **throwaway** database:

```bash
createdb rentindex_test
DATABASE_URL=postgres://localhost/rentindex_test npm run test:db
```

That applies `supabase/migrations/` to the empty database and then runs the
golden assertions, so it also proves the migrations still rebuild the schema from
nothing. CI runs all of it on every push.

---

## How it fits together

```
app/
  api/            route handlers (all server-side; no key reaches the browser)
  components/     the UI
  lib/            the logic worth testing
    tenancy.ts    the Lagos Tenancy Law 2011 rules engine — pure, no I/O
    db.ts         Supabase access over PostgREST
    fees.ts       move-in fee parsing from the survey's free text
    amounts.ts    Naira parsing + the corroboration rules
    llm.ts        model selection, spend cap, graceful degradation
scripts/
  scrapers/       jiji.mjs, npc.mjs — run weekly by GitHub Actions
supabase/
  migrations/     the whole database: tables, indexes, RLS, and 14 functions
tests/
  *.test.ts       unit tests
  db/             golden tests for the SQL
```

### The database is in the repository

The pricing engine is a Postgres function, `rent_lookup`, not TypeScript. It
walks a ladder — area and type, then area at any type, then city, then state —
and takes the first rung with a real sample behind it, so an answer always comes
from the finest geography that can support it.

All of that, plus the other thirteen functions, lives in `supabase/migrations/`.

> **Change the schema with a migration, never in the Supabase dashboard.** These
> functions previously existed only in the live project — no history, no review,
> no way back. The CI database job rebuilds from these files on every push, which
> is what keeps the two in step.

RLS is enabled on every table with **no policies**, deliberately: all access goes
through the server on the service role key, and the anon key can read nothing.
Adding a policy opens that table to the public internet.

---

## Environment

Nothing is required to boot. Each block below buys you a feature.

| Variable | Needed for |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | **Everything data-driven** — the index, RentBot's answers, submissions, the insights on the homepage. Server-only; never expose the service role key. |
| `GROQ_API_KEY` | RentBot's conversational replies. Without it, verdicts still work — they are composed deterministically. |
| `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | Fallback LLM, for when a Groq model is retired out from under us. |
| `GROQ_MODEL` | Pin a model, tried first. Groq retires model IDs without warning — it has taken RentBot down twice — so a candidate list is tried in order on first use and whichever answers is cached. |
| `LLM_DAILY_CALL_LIMIT` (default 2000), `LLM_TIMEOUT_MS` (default 20000) | The spend cap. Reservation is atomic in Postgres, so concurrent requests cannot both claim the last call. |
| `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`, `BREVO_LIST_ID` | Transactional email and waitlist contacts. Preferred provider. |
| `RESEND_API_KEY`, `RESEND_AUDIENCE_ID` | Email fallback, used when Brevo is not configured. |
| `OWNER_EMAIL` | Where submissions and signups are sent. |
| `ADMIN_SECRET` | Guards `/api/admin/*`. Generate with `openssl rand -hex 32`. |
| `GOOGLE_SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_KEY` | Legacy dual-write backup of submissions. Optional; Supabase is the source of truth. |

The scrapers read the same variables from the real environment first and `.env`
second, because CI has no `.env` and `vercel env pull` writes empty placeholders.

---

## API

| Route | Auth | What it does |
|---|---|---|
| `GET /api/health` | — | Is the platform actually working? Checks the LLM, the database, and **how stale the index is**. Returns 503 when something is wrong. Free to call. |
| `POST /api/chat` | — | RentBot. |
| `POST /api/chatbot/extract-data` | — | Pull a renter row out of a conversation, with corroboration. |
| `POST /api/tenancy/check` | — | The rules engine. |
| `GET /api/card` | — | The shareable verdict card image. |
| `GET /api/move-in-cost` | — | Move-in cost breakdown. |
| `POST /api/submit-data` | — | Save a form submission. |
| `POST /api/waitlist` | — | Join the waitlist. Saved to our own table first, synced to the email provider after, so a provider outage costs the sync and not the signup. |
| `GET /api/insights` | — | Aggregates for the homepage. |
| `GET /api/response-count` | — | Submission count (cached 60s). |
| `GET /api/keepalive` | — | Daily cron: keeps the free-tier project awake and expires old chat transcripts. |
| `GET /api/admin/waitlist[/export]` | `?secret=` | List or export the waitlist as CSV. |

---

## Scheduled work

| Workflow | When | |
|---|---|---|
| `.github/workflows/ci.yml` | every push and PR | Typecheck, unit tests, build, database golden tests. |
| `.github/workflows/scrape.yml` | 03:20 UTC Mondays | Refreshes the asking-price half of the index. Needs the `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` **repository secrets**. |

The scrape runs on Actions rather than a Vercel cron because the scrapers
throttle every request by design (2.5–4s) and a full pass takes many minutes,
which no serverless timeout allows.

**If the scrape fails it now says so**, by opening a GitHub issue — it once
failed every Monday for seven consecutive weeks, unnoticed, because those secrets
were never set. `/api/health` reports the age of the newest listing for the same
reason: a stale index breaks no request, it just makes every answer quietly
wrong.

---

## Deployment

Vercel. All environment variables must be set in the project settings; the
repository secrets above are separate and only used by Actions.

```bash
vercel deploy
```

See `HANDOVER.md` for what is in flight and what is blocked.
