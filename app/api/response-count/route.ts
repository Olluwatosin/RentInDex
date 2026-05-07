import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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

export async function GET() {
  const results = await Promise.allSettled(
    SHEET_URLS.map((url) =>
      fetch(url, { cache: "no-store", redirect: "follow" })
        .then((res) => (res.ok ? res.text() : ""))
        .then(countRows)
    )
  );

  const total = results.reduce((sum, r) => {
    return sum + (r.status === "fulfilled" ? r.value : 0);
  }, 0);

  return NextResponse.json(
    { count: total > 0 ? total : 142 },
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
      },
    }
  );
}
