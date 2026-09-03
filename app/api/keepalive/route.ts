import { NextResponse } from "next/server";
import { dbConfigured, getResponseCount, cleanupChatSessions } from "@/app/lib/db";

// Free-tier Supabase pauses after ~7 days with no queries, which silently
// breaks RentBot and the live stats. A daily Vercel cron hits this route to
// run one lightweight query and keep the database awake.
export const dynamic = "force-dynamic";

export async function GET() {
  if (!dbConfigured()) {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
  }
  try {
    const count = await getResponseCount();
    // Chat transcripts are short-lived working state, not an archive. Without
    // this the table only ever grows, and it grows fastest under exactly the
    // abuse the rate limiter is there to blunt.
    const sessionsRemoved = await cleanupChatSessions();
    return NextResponse.json({
      ok: true,
      count,
      sessionsRemoved,
      at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("keepalive query failed:", err);
    return NextResponse.json({ ok: false, reason: "query_failed" }, { status: 500 });
  }
}
