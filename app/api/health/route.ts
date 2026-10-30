import { NextResponse } from "next/server";
import {
  dbConfigured,
  extractionFunnel,
  getResponseCount,
  indexFreshness,
  llmUsageToday,
} from "@/app/lib/db";
import { activeModel, groqModelHealth } from "@/app/lib/llm";

export const dynamic = "force-dynamic";

// Is RentInDex actually working right now?
//
// This exists because the whole platform was down and nobody knew. Groq retired
// the model ID, every chat reply became "I'm having trouble connecting", every
// data extraction failed — and the site kept returning HTTP 200 the entire
// time, so no uptime monitor noticed. A 200 with a broken brain is the failure
// mode this endpoint is built to catch.
//
// Deliberately free to call: it lists Groq's models rather than generating
// tokens, so it can be polled by an uptime monitor without costing anything.
export async function GET() {
  const checks: Record<string, { ok: boolean; detail: string }> = {};

  const llm = await groqModelHealth();
  checks.llm = { ok: llm.ok, detail: llm.detail };
  if (llm.ok) checks.llm.detail += activeModel() ? ` · serving ${activeModel()}` : "";

  if (!dbConfigured()) {
    checks.database = { ok: false, detail: "SUPABASE_URL / SERVICE_ROLE_KEY not set" };
  } else {
    try {
      const n = await getResponseCount();
      checks.database = { ok: true, detail: `reachable · ${n} renter rows` };
    } catch (err) {
      // The free tier pauses after ~7 days idle, which silently breaks lookups.
      checks.database = {
        ok: false,
        detail: `unreachable (project may be paused): ${
          err instanceof Error ? err.message : err
        }`,
      };
    }
  }

  // Is the index still being refreshed?
  //
  // The scrapers run weekly, so two missed cycles means something is broken.
  // This is the check that would have caught seven weeks of failed scheduled
  // scrapes on the first Monday instead of the fiftieth day — a stale index
  // does not break any request, it just makes every answer quietly wrong.
  const STALE_AFTER_DAYS = 14;
  if (dbConfigured() && checks.database.ok) {
    try {
      const fresh = await indexFreshness();
      if (fresh.ageDays == null) {
        checks.dataFreshness = { ok: false, detail: "the index holds no listings at all" };
      } else {
        checks.dataFreshness = {
          ok: fresh.ageDays <= STALE_AFTER_DAYS,
          detail:
            `newest listing ${fresh.ageDays}d old` +
            (fresh.ageDays > STALE_AFTER_DAYS
              ? ` · stale, the weekly scrape has not landed in ${Math.floor(fresh.ageDays / 7)} week(s)`
              : "") +
            (fresh.lastSuccessfulScrape
              ? ` · last good scrape ${fresh.lastSuccessfulScrape.slice(0, 10)}`
              : " · no successful scrape on record"),
        };
      }
    } catch (err) {
      checks.dataFreshness = {
        ok: false,
        detail: `could not read index age: ${err instanceof Error ? err.message : err}`,
      };
    }
  }

  // Is RentBot's data collection actually converting?
  //
  // It has produced zero renter rows in its entire life, and until now nothing
  // could say whether that was no users or a guard refusing every conversation —
  // the reasons went to the console and the logs are kept for an hour. Reported
  // rather than checked: a day with no chats is not a fault, and the shape of
  // the funnel is the diagnosis.
  const extraction = dbConfigured() && checks.database.ok
    ? await extractionFunnel(30).catch(() => null)
    : null;

  // Today's model spend. Reported rather than checked: exhausting the budget
  // is a deliberate, safe state — RentBot falls back to deterministic answers —
  // so it must not turn the health check red. `refused` climbing is the signal
  // that the cap is actually biting.
  const usage = dbConfigured() ? await llmUsageToday() : null;

  const ok = Object.values(checks).every((c) => c.ok);
  return NextResponse.json(
    {
      ok,
      checkedAt: new Date().toISOString(),
      checks,
      llmUsageToday: usage ?? undefined,
      extractionLast30Days: extraction
        ? {
            attempts: extraction.reduce((n, o) => n + o.n, 0),
            saved: extraction.find((o) => o.outcome === "saved")?.n ?? 0,
            byOutcome: Object.fromEntries(extraction.map((o) => [o.outcome, o.n])),
          }
        : undefined,
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}
