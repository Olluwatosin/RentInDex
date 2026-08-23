// Supabase (Postgres) access via PostgREST — server-side only.
// Uses the service role key; RLS denies everything to public keys by design.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function dbConfigured(): boolean {
  return Boolean(SUPABASE_URL && SERVICE_ROLE_KEY);
}

function headers(): Record<string, string> {
  return {
    apikey: SERVICE_ROLE_KEY!,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };
}

export interface RenterRow {
  source: "form" | "chatbot";
  conversation_id?: string | null;
  state: string;
  city?: string | null;
  area_raw?: string | null;
  property_type?: string | null;
  rent_range?: string | null;
  total_cost_range?: string | null;
  annual_rent?: number | null;
  agency_fee?: number | null;
  caution_deposit?: number | null;
  service_charge?: number | null;
  finder_fee?: number | null;
  power_hours?: number | null;
  power_band?: string | null;
  power_metering?: string | null;
  confidence?: string | null;
  email?: string | null;
}

export async function insertRenterRow(row: RenterRow): Promise<void> {
  // With a conversation_id, upsert so repeated extractions of the same growing
  // chat update one row instead of inserting duplicates. Otherwise plain insert.
  const upsert = row.conversation_id != null;
  const url = `${SUPABASE_URL}/rest/v1/renter_data${upsert ? "?on_conflict=conversation_id" : ""}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...headers(),
      Prefer: upsert ? "resolution=merge-duplicates,return=minimal" : "return=minimal",
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    throw new Error(`Supabase insert failed (${res.status}): ${await res.text()}`);
  }
}

export interface RentBand {
  // "city" sits between: the row matched on its city column rather than its
  // area column, so it describes a whole town, not a neighbourhood.
  level: "area" | "city" | "state";
  p25: number;
  p50: number;
  p75: number;
  n: number;
}

export interface RentLookup {
  state: string;
  area: string | null;
  property_type: string | null;
  user_rent: number | null;
  asking: RentBand | null;
  actual: RentBand | null;
  verdict: "below" | "fair" | "above" | "no_rent" | "insufficient";
  verdict_basis: "actual" | "asking" | null;
  confidence: "high" | "medium" | "low" | null;
}

// Query the rent answer engine (Postgres RPC). Returns dual-source bands
// (asking vs actually-paid) with honest geography fallback + a verdict.
export async function rentLookup(params: {
  state: string;
  area?: string | null;
  propertyType?: string | null;
  annualRent?: number | null;
}): Promise<RentLookup | null> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/rent_lookup`, {
    method: "POST",
    headers: headers(),
    cache: "no-store",
    body: JSON.stringify({
      p_state: params.state,
      p_area: params.area ?? null,
      p_property_type: params.propertyType ?? null,
      p_annual_rent: params.annualRent ?? null,
    }),
  });
  if (!res.ok) {
    console.error(`rent_lookup failed (${res.status}): ${await res.text()}`);
    return null;
  }
  return (await res.json()) as RentLookup;
}

// Fetch all renter rows (columns needed for homepage insights aggregation).
export async function fetchRenterRows(): Promise<unknown[]> {
  const cols = [
    "state", "city", "area_raw", "property_type", "rent_estimate", "value_rating",
    "lease_period", "found_via", "landlord_interest", "agency_fee_raw", "agency_fee",
    "finder_fee_raw", "finder_fee", "caution_deposit_raw", "caution_deposit",
    "service_charge_raw", "service_charge", "is_outlier",
  ].join(",");
  const res = await fetch(`${SUPABASE_URL}/rest/v1/renter_data?select=${cols}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`fetchRenterRows failed (${res.status})`);
  return res.json();
}

export async function countListings(): Promise<number> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/listings_data?select=id`, {
    method: "HEAD",
    headers: { ...headers(), Prefer: "count=exact" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`countListings failed (${res.status})`);
  const total = res.headers.get("content-range")?.split("/")[1];
  return total ? parseInt(total, 10) : 0;
}

// Areas we have data for in a state (most-covered first) — for RentBot to
// offer real alternatives when it lacks the exact place a user asked about.
export async function areasInState(state: string): Promise<string[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/areas_in_state`, {
    method: "POST",
    headers: headers(),
    cache: "no-store",
    body: JSON.stringify({ p_state: state }),
  });
  if (!res.ok) return [];
  const rows = (await res.json()) as { area: string; n: number }[];
  return rows.map((r) => r.area).filter(Boolean);
}

// Infer the state for an area the user named without a state (e.g. "Gwarinpa").
export async function stateForArea(area: string): Promise<string | null> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/find_state_for_area`, {
    method: "POST",
    headers: headers(),
    cache: "no-store",
    body: JSON.stringify({ p_area: area }),
  });
  if (!res.ok) return null;
  const val = await res.json();
  return typeof val === "string" && val.length > 0 ? val : null;
}

export async function getResponseCount(): Promise<number> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/renter_data?select=id`, {
    method: "HEAD",
    headers: { ...headers(), Prefer: "count=exact" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Supabase count failed (${res.status})`);
  }
  const range = res.headers.get("content-range"); // e.g. "0-24/216"
  const total = range?.split("/")[1];
  const count = total ? parseInt(total, 10) : NaN;
  if (Number.isNaN(count)) {
    throw new Error(`Unexpected content-range: ${range}`);
  }
  return count;
}

export interface WaitlistInsert {
  inserted: boolean;
  alreadyPresent: boolean;
}

// Store a waitlist signup locally BEFORE any email provider is involved.
// Signups used to live only in Brevo/Resend behind a swallowed catch, so a
// provider outage lost the address while still telling the user they were on
// the list. Throws on failure — the caller must not confirm what wasn't saved.
export async function insertWaitlistEmail(
  email: string,
  source = "site"
): Promise<WaitlistInsert> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/waitlist?on_conflict=email`,
    {
      method: "POST",
      headers: {
        ...headers(),
        // ignore-duplicates makes a repeat signup a no-op rather than an error,
        // and returns only genuinely inserted rows — so an empty array is an
        // exact "already on the list" signal, with no timestamp guessing and no
        // clobbering the original signup's source or date.
        Prefer: "resolution=ignore-duplicates,return=representation",
      },
      body: JSON.stringify({ email, source }),
    }
  );
  if (!res.ok) {
    throw new Error(`waitlist insert failed (${res.status}): ${await res.text()}`);
  }
  const rows = (await res.json()) as unknown[];
  const isNew = rows.length > 0;
  return { inserted: true, alreadyPresent: !isNew };
}

// Record that the address made it to the email provider, so unsynced rows can
// be retried later without re-sending anything.
export async function markWaitlistSynced(email: string, provider: string): Promise<void> {
  await fetch(
    `${SUPABASE_URL}/rest/v1/waitlist?email=eq.${encodeURIComponent(email)}`,
    {
      method: "PATCH",
      headers: { ...headers(), Prefer: "return=minimal" },
      body: JSON.stringify({
        provider_synced: true,
        provider,
        provider_synced_at: new Date().toISOString(),
      }),
    }
  ).catch(() => {});
}

export interface WaitlistRow {
  email: string;
  created_at: string;
  source: string;
  provider_synced: boolean;
  provider: string | null;
}

// The waitlist, newest first — for the admin views. Reads our own table rather
// than the email provider, which is now only a downstream sync.
export async function fetchWaitlist(): Promise<WaitlistRow[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/waitlist?select=email,created_at,source,provider_synced,provider&order=created_at.desc`,
    { headers: headers(), cache: "no-store" }
  );
  if (!res.ok) throw new Error(`fetchWaitlist failed (${res.status})`);
  return res.json();
}
