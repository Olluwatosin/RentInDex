import { NextRequest, NextResponse } from "next/server";
import { dbConfigured, fetchWaitlist } from "@/app/lib/db";

export const dynamic = "force-dynamic";

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // Quote anything that would otherwise break the column structure.
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  if (!dbConfigured()) {
    return new NextResponse("Database not configured", { status: 503 });
  }

  try {
    const rows = await fetchWaitlist();
    const csv = [
      "email,created_at,source,provider_synced,provider",
      ...rows.map((r) =>
        [r.email, r.created_at, r.source, r.provider_synced, r.provider].map(csvCell).join(",")
      ),
    ].join("\n");

    const filename = `rentindex-waitlist-${new Date().toISOString().slice(0, 10)}.csv`;
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("admin waitlist export error:", err);
    return new NextResponse("Failed to export waitlist", { status: 500 });
  }
}
