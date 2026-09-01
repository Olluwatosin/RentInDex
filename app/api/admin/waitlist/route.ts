import { NextRequest, NextResponse } from "next/server";
import { dbConfigured, fetchWaitlist } from "@/app/lib/db";
import { isAuthorisedAdmin } from "@/app/lib/admin-auth";

export const dynamic = "force-dynamic";

// Reads the `waitlist` table, not the email provider. Signups are stored locally
// first now, so this shows the real list even when Brevo/Resend are unconfigured
// — which is exactly the situation that previously made this endpoint useless.
export async function GET(req: NextRequest) {
  if (!isAuthorisedAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const rows = await fetchWaitlist();
    return NextResponse.json({
      count: rows.length,
      pending_provider_sync: rows.filter((r) => !r.provider_synced).length,
      contacts: rows,
    });
  } catch (err) {
    console.error("admin waitlist error:", err);
    return NextResponse.json({ error: "Failed to load waitlist" }, { status: 500 });
  }
}
