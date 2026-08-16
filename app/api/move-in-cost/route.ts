import { NextResponse } from "next/server";
import { dbConfigured, fetchRenterRows } from "@/app/lib/db";
import { computeFeeStats, FeeRow } from "@/app/lib/fees";

export const dynamic = "force-dynamic";

// Fee benchmarks for the move-in cost calculator.
//
// Nationwide only, deliberately. Rent varies enormously by area — which is why
// rent_lookup falls back through area/state — but the fee *conventions* (10%
// agency, 2.5% finder's) are near-uniform across Nigerian markets, and no single
// state has enough responses to cut four fees by geography without the numbers
// going noisy. Revisit once the crowd dataset is deeper.
export async function GET() {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  try {
    const rows = (await fetchRenterRows()) as FeeRow[];
    const fees = computeFeeStats(rows);
    const sampleSize = Math.max(...fees.map((f) => f.answered), 0);

    return NextResponse.json(
      { fees, sampleSize },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
    );
  } catch (err) {
    console.error("move-in-cost error:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
