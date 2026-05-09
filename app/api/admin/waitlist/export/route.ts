import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const audienceId = process.env.RESEND_AUDIENCE_ID;
  if (!audienceId) {
    return new NextResponse("RESEND_AUDIENCE_ID env var not set", { status: 500 });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await resend.contacts.list({ audienceId });

  if (error) {
    return new NextResponse(error.message, { status: 500 });
  }

  const contacts = data?.data ?? [];
  const rows = [
    "email,created_at,unsubscribed",
    ...contacts.map((c) =>
      `${c.email},${c.created_at},${c.unsubscribed}`
    ),
  ];

  const csv = rows.join("\n");
  const filename = `rentindex-waitlist-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
