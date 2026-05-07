import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSsLV81GO5yn2g44fqYEXwTKw1XhbKKG1z8GULUtp369arrffg1uIiMHwNb7Sgl1efNmWbp4UC3xz36/pub?output=csv";

export async function GET() {
  try {
    const res = await fetch(CSV_URL, {
      cache: "no-store",
      redirect: "follow",
    });

    if (!res.ok) {
      return NextResponse.json({ count: 142 });
    }

    const text = await res.text();
    // Split on \n or \r\n, drop header row, drop empty rows
    const dataRows = text
      .split(/\r?\n/)
      .slice(1)
      .filter((row) => row.trim().length > 0);

    const count = Math.max(dataRows.length, 0);
    return NextResponse.json({ count }, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
      },
    });
  } catch {
    return NextResponse.json({ count: 142 });
  }
}
