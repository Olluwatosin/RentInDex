// One-off: pull existing waitlist contacts out of the email provider and into
// the `waitlist` table.
//
// Signups used to be written only to Brevo/Resend, so the provider is currently
// the only record of who joined. This recovers them into our own database, after
// which the provider becomes a secondary sync rather than the source of truth.
//
//   node scripts/backfill-waitlist.mjs [--dry]

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Real process env wins over .env — `vercel env pull` writes empty "" placeholders
// for secrets, so the file alone is usually not enough. Run it like:
//   RESEND_API_KEY=re_xxx RESEND_AUDIENCE_ID=yyy node scripts/backfill-waitlist.mjs
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
try {
  for (const line of readFileSync(resolve(repoRoot, ".env"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z_0-9]*)=(.*)$/);
    if (m) {
      const value = m[2].replace(/^["']|["']$/g, "").trim();
      if (value) env[m[1]] = value;
    }
  }
} catch {
  /* no .env is fine when everything comes from the real environment */
}
for (const [k, v] of Object.entries(process.env)) if (v) env[k] = v;

if (!env.RESEND_API_KEY && !env.BREVO_API_KEY) {
  console.error(
    "No email-provider credentials found.\n" +
      "Both Resend and Brevo are unset, so there is nothing to back up from.\n" +
      "Run with the real keys, e.g.:\n" +
      "  RESEND_API_KEY=re_xxx RESEND_AUDIENCE_ID=yyy node scripts/backfill-waitlist.mjs --dry"
  );
  process.exit(1);
}

const DRY = process.argv.includes("--dry");
const SUPABASE_URL = env.SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

async function fromResend() {
  const key = env.RESEND_API_KEY;
  const audience = env.RESEND_AUDIENCE_ID;
  if (!key || !audience) return [];
  const res = await fetch(`https://api.resend.com/audiences/${audience}/contacts`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    console.error(`Resend list failed (${res.status}): ${await res.text()}`);
    return [];
  }
  const body = await res.json();
  return (body?.data ?? [])
    .filter((c) => c.email && !c.unsubscribed)
    .map((c) => ({
      email: String(c.email).trim().toLowerCase(),
      created_at: c.created_at ?? undefined,
      provider: "resend",
    }));
}

async function fromBrevo() {
  const key = env.BREVO_API_KEY;
  if (!key) return [];
  const out = [];
  let offset = 0;
  for (;;) {
    const res = await fetch(
      `https://api.brevo.com/v3/contacts?limit=500&offset=${offset}`,
      { headers: { "api-key": key, accept: "application/json" } }
    );
    if (!res.ok) {
      console.error(`Brevo list failed (${res.status}): ${await res.text()}`);
      break;
    }
    const body = await res.json();
    const batch = body?.contacts ?? [];
    for (const c of batch) {
      if (c.email && !c.emailBlacklisted) {
        out.push({
          email: String(c.email).trim().toLowerCase(),
          created_at: c.createdAt ?? undefined,
          provider: "brevo",
        });
      }
    }
    if (batch.length < 500) break;
    offset += 500;
  }
  return out;
}

async function main() {
  const contacts = [...(await fromResend()), ...(await fromBrevo())];

  // De-duplicate, keeping the earliest signup date we know about.
  const byEmail = new Map();
  for (const c of contacts) {
    const prev = byEmail.get(c.email);
    if (!prev || (c.created_at && prev.created_at && c.created_at < prev.created_at)) {
      byEmail.set(c.email, c);
    }
  }
  const rows = [...byEmail.values()].map((c) => ({
    email: c.email,
    source: "backfill",
    provider: c.provider,
    provider_synced: true,
    provider_synced_at: new Date().toISOString(),
    ...(c.created_at ? { created_at: c.created_at } : {}),
  }));

  console.log(`Found ${contacts.length} contact(s), ${rows.length} unique.`);
  if (!rows.length) return;
  if (DRY) {
    console.log(rows.map((r) => `  ${r.email} (${r.provider})`).join("\n"));
    console.log("\n--dry: nothing written.");
    return;
  }

  // ignore-duplicates: never overwrite a real signup with a backfilled one.
  const res = await fetch(`${SUPABASE_URL}/rest/v1/waitlist?on_conflict=email`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=representation",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    console.error(`Insert failed (${res.status}): ${await res.text()}`);
    process.exit(1);
  }
  const inserted = await res.json();
  console.log(`Inserted ${inserted.length} new row(s); ${rows.length - inserted.length} already present.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
