import { NextResponse } from "next/server";
import { dbConfigured, getResponseCount } from "@/app/lib/db";

export const dynamic = "force-dynamic";

// Legacy fallback: published Google Sheets CSVs (pre-Supabase data sources).
const SHEET_URLS = [
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSsLV81GO5yn2g44fqYEXwTKw1XhbKKG1z8GULUtp369arrffg1uIiMHwNb7Sgl1efNmWbp4UC3xz36/pub?output=csv",
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRwCnAMMjZ2eOR0peGss4PHzjo5azYEIiS4MyotKdkTRKdJmYiXtZgYDRsrP5YUMgrtIWIEuPE_oq21/pub?output=csv",
];

function countRows(csv: string): number {
  return csv
    .split(/\r?\n/)
    .slice(1)
    .filter((row) => row.trim().length > 0).length;
}

async function countFromSheets(): Promise<number> {
  const results = await Promise.allSettled(
    SHEET_URLS.map((url) =>
      fetch(url, { cache: "no-store", redirect: "follow" })
        .then((res) => (res.ok ? res.text() : ""))
        .then(countRows)
    )
  );
  return results.reduce(
    (sum, r) => sum + (r.status === "fulfilled" ? r.value : 0),
    0
  );
}

export async function GET() {
  let total = 0;

  if (dbConfigured()) {
    try {
      total = await getResponseCount();
    } catch (err) {
      console.error("Supabase count failed, falling back to sheets:", err);
    }
  }

  if (total === 0) {
    total = await countFromSheets();
  }

  return NextResponse.json(
    { count: total > 0 ? total : 142 },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    }
  );
}
