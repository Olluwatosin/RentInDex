// Shared environment + run logging for the scrapers.
//
// Two jobs:
//  1. Resolve credentials from the real environment first, falling back to .env.
//     CI has no .env file, and `vercel env pull` writes empty "" placeholders,
//     so neither source alone is sufficient.
//  2. Record each run in `scrape_runs`. Once these are scheduled rather than
//     hand-run, a silent failure means the listings half of the index goes stale
//     without anyone noticing.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function loadEnv() {
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
    /* no .env in CI — that's expected */
  }
  for (const [k, v] of Object.entries(process.env)) if (v) env[k] = v;
  return env;
}

export const env = loadEnv();
export const SUPABASE_URL = env.SUPABASE_URL;
export const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const dbHeaders = () => ({
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
});

// Logging must never take a scrape down with it — a failed log is reported and
// then ignored, and the run continues.
export async function startRun(source) {
  if (!SUPABASE_URL || !SERVICE_KEY) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/scrape_runs`, {
      method: "POST",
      headers: { ...dbHeaders(), Prefer: "return=representation" },
      body: JSON.stringify({
        source,
        triggered_by: process.env.GITHUB_ACTIONS ? "github-actions" : "manual",
      }),
    });
    if (!res.ok) return null;
    const [row] = await res.json();
    return row?.id ?? null;
  } catch {
    return null;
  }
}

export async function finishRun(id, { ok, parsed, sent, error }) {
  if (!id || !SUPABASE_URL || !SERVICE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/scrape_runs?id=eq.${id}`, {
      method: "PATCH",
      headers: { ...dbHeaders(), Prefer: "return=minimal" },
      body: JSON.stringify({
        finished_at: new Date().toISOString(),
        ok,
        parsed: parsed ?? null,
        sent: sent ?? null,
        error: error ? String(error).slice(0, 800) : null,
      }),
    });
  } catch {
    /* best-effort */
  }
}
