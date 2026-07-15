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
  confidence?: string | null;
  email?: string | null;
}

export async function insertRenterRow(row: RenterRow): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/renter_data`, {
    method: "POST",
    headers: { ...headers(), Prefer: "return=minimal" },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    throw new Error(`Supabase insert failed (${res.status}): ${await res.text()}`);
  }
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
