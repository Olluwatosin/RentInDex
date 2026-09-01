import { NextResponse } from "next/server";
import { dbConfigured, getResponseCount } from "@/app/lib/db";
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

  const ok = Object.values(checks).every((c) => c.ok);
  return NextResponse.json(
    { ok, checkedAt: new Date().toISOString(), checks },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}
