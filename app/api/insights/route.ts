import { NextResponse } from "next/server";
import { dbConfigured, fetchRenterRows, countListings } from "@/app/lib/db";

export const dynamic = "force-dynamic";

// ─── property-type classification (matches the scraper's buckets) ─────────────
function classifyType(raw: string | null): string | null {
  if (!raw) return null;
  const t = raw.toLowerCase();
  if (/self[\s-]?contain|studio/.test(t)) return "Self-contained";
  if (/mini[\s-]?flat/.test(t)) return "Mini flat";
  if (/\broom\b|face me/.test(t)) return "Single room";
  if (/duplex|bungalow|terrace|detached/.test(t)) return "Duplex";
  const beds = t.match(/(\d+)\s*bed/);
  if (beds) {
    const n = parseInt(beds[1], 10);
    if (n >= 4) return "4+ bedroom";
    if (n >= 1) return `${n}-bed flat`;
  }
  return "Other";
}

const paidFee = (raw: string | null, numeric: number | null): boolean =>
  (raw != null && !/^\s*no/i.test(raw)) || (numeric != null && numeric > 0);

interface Row {
  state: string | null;
  city: string | null;
  area_raw: string | null;
  property_type: string | null;
  rent_estimate: number | null;
  value_rating: number | null;
  lease_period: string | null;
  found_via: string | null;
  landlord_interest: string | null;
  agency_fee_raw: string | null;
  agency_fee: number | null;
  finder_fee_raw: string | null;
  finder_fee: number | null;
  caution_deposit_raw: string | null;
  caution_deposit: number | null;
  service_charge_raw: string | null;
  service_charge: number | null;
  is_outlier: boolean;
}

const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100) : 0);

function aggregate(rows: Row[], listingsCount: number) {
  const clean = rows.filter((r) => !r.is_outlier);
  const total = clean.length;

  const states = new Set(clean.map((r) => r.state).filter(Boolean));
  const cities = new Set(clean.map((r) => r.city ?? r.area_raw).filter(Boolean));

  // hero: share on a 2025–26 lease (among those who answered)
  const leased = clean.filter((r) => r.lease_period);
  const recent = leased.filter((r) => /2025|2026/.test(r.lease_period ?? ""));

  // fee cards
  const feeCards = [
    { key: "agency", raw: "agency_fee_raw", num: "agency_fee" },
    { key: "finder", raw: "finder_fee_raw", num: "finder_fee" },
    { key: "caution", raw: "caution_deposit_raw", num: "caution_deposit" },
    { key: "service", raw: "service_charge_raw", num: "service_charge" },
  ].map(({ raw, num }) => {
    const answered = clean.filter(
      (r) => (r as never)[raw] != null || (r as never)[num] != null
    );
    const paid = answered.filter((r) =>
      paidFee((r as never)[raw], (r as never)[num])
    );
    return pct(paid.length, answered.length);
  });

  // top states
  const stateCounts = new Map<string, number>();
  for (const r of clean) if (r.state) stateCounts.set(r.state, (stateCounts.get(r.state) ?? 0) + 1);
  const topStates = [...stateCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([state, n]) => ({ state, pct: pct(n, total) }));

  // rent distribution
  const buckets = [
    { range: "< ₦150k", max: 150_000 },
    { range: "₦150k–₦300k", max: 300_000 },
    { range: "₦300k–₦600k", max: 600_000 },
    { range: "₦600k–₦1M", max: 1_000_000 },
    { range: "₦1M–₦2M", max: 2_000_000 },
    { range: "> ₦2M", max: Infinity },
  ];
  const withRent = clean.filter((r) => r.rent_estimate != null);
  const rentCounts = buckets.map(
    (b, i) =>
      withRent.filter((r) => {
        const v = r.rent_estimate as number;
        const lo = i === 0 ? 0 : buckets[i - 1].max;
        return v >= lo && v < b.max;
      }).length
  );
  const maxRent = Math.max(...rentCounts);
  const rentRanges = buckets.map((b, i) => ({
    range: b.range,
    pct: pct(rentCounts[i], withRent.length),
    highlight: rentCounts[i] === maxRent && maxRent > 0,
  }));

  // value ratings
  const rated = clean.filter((r) => r.value_rating != null);
  const ratingLabels = ["Very poor", "Poor", "Average", "Good", "Excellent"];
  const starRatings = [1, 2, 3, 4, 5].map((stars) => ({
    stars,
    label: ratingLabels[stars - 1],
    pct: pct(rated.filter((r) => Math.round(r.value_rating as number) === stars).length, rated.length),
  }));

  // property types
  const typeCounts = new Map<string, number>();
  let typed = 0;
  for (const r of clean) {
    const c = classifyType(r.property_type);
    if (c) {
      typeCounts.set(c, (typeCounts.get(c) ?? 0) + 1);
      typed++;
    }
  }
  const propertyTypes = [...typeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([type, n]) => ({ type, pct: pct(n, typed) }));

  // found via
  const foundAnswered = clean.filter((r) => r.found_via);
  const foundViaAgentPct = pct(
    foundAnswered.filter((r) => /agent/i.test(r.found_via ?? "")).length,
    foundAnswered.length
  );
  const foundViaWebsitePct = pct(
    foundAnswered.filter((r) => /website/i.test(r.found_via ?? "")).length,
    foundAnswered.length
  );

  // landlord connections
  const readyToList = clean.filter((r) => /list me/i.test(r.landlord_interest ?? "")).length;
  const knowInterested = clean.filter((r) => /know landlords/i.test(r.landlord_interest ?? "")).length;

  return {
    totals: { responses: total, states: states.size, cities: cities.size, listings: listingsCount },
    heroSignedLeasePct: pct(recent.length, leased.length),
    feeCards,
    topStates,
    rentRanges,
    starRatings,
    propertyTypes,
    foundViaAgentPct,
    foundViaWebsitePct,
    landlords: { readyToList, knowInterested, total: readyToList + knowInterested },
  };
}

export async function GET() {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  try {
    // Sequential, not parallel: a just-woken free-tier DB can drop one of two
    // concurrent requests. Do the heavy fetch first, then the light count.
    const rows = (await fetchRenterRows()) as Row[];
    let listings = 0;
    let listingsOk = true;
    try {
      listings = await countListings();
    } catch {
      listingsOk = false; // transient — don't poison the cache with a 0
    }
    return NextResponse.json(aggregate(rows, listings), {
      headers: {
        // Only cache for long when the data is complete; otherwise let it self-heal.
        "Cache-Control": listingsOk
          ? "public, s-maxage=300, stale-while-revalidate=600"
          : "public, s-maxage=10",
      },
    });
  } catch (err) {
    console.error("insights error:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
