#!/usr/bin/env node
// Does supabase/migrations/ still describe the live database?
//
// Nothing applies these files on deploy — a Vercel build does not run
// migrations — so the repository and the project stay in step only while
// somebody remembers. Two migrations have already been applied by hand. This
// turns "I think they match" into a check that either passes or names the
// difference.
//
// Both sides are fingerprinted the same way, by the same function:
//   - the reference is a throwaway Postgres built purely from the migrations
//   - the live side answers schema_fingerprint() over PostgREST
//
// Structure only: table and column names, types, defaults, constraints,
// indexes, triggers, RLS flags, policies, and a hash of each function body.
// Nobody's data is read.
//
// Usage:
//   DATABASE_URL=postgres://localhost/rentindex_drift node scripts/check-schema-drift.mjs
//
// Exit codes: 0 in step, 1 drifted, 2 could not check.

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { SUPABASE_URL, SERVICE_KEY } from "./scrapers/run-env.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const localUrl = process.env.DATABASE_URL;

// Not being able to check is its own outcome, and must not read as "in step".
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Cannot check for drift: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set.\n" +
      "In CI these are repository secrets (Settings → Secrets and variables → Actions)."
  );
  process.exit(2);
}
if (!localUrl) {
  console.error(
    "Cannot check for drift: DATABASE_URL is not set.\n" +
      "It must point at a THROWAWAY Postgres — the migrations are applied to it."
  );
  process.exit(2);
}

const psql = (args) =>
  spawnSync("psql", [localUrl, "-v", "ON_ERROR_STOP=1", "-q", ...args], {
    encoding: "utf8",
    cwd: repoRoot,
  });

function run(args, label) {
  const res = psql(args);
  if (res.error?.code === "ENOENT") {
    console.error("psql was not found on PATH. Install the Postgres client tools.");
    process.exit(2);
  }
  if (res.status !== 0) {
    console.error(`${label} failed:\n${res.stderr}`);
    process.exit(2);
  }
  return res.stdout;
}

// ── build the reference from the repository alone ────────────────────────────

run(["-c", "create schema if not exists extensions;"], "schema setup");

const migrations = readdirSync(resolve(repoRoot, "supabase/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort();

for (const file of migrations) {
  run(["-f", `supabase/migrations/${file}`], file);
}

const fingerprintOf = (out) => {
  const [lines, md5] = out.trim().split("|");
  return { lines: Number(lines), md5 };
};

const local = fingerprintOf(
  run(
    ["-At", "-c", "select (schema_fingerprint()->>'lines'), (schema_fingerprint()->>'md5')"],
    "local fingerprint"
  )
);

// ── ask the live project for its own ─────────────────────────────────────────

async function liveRpc(fn) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (!res.ok) {
    const body = await res.text();
    // The commonest cause by far: this migration has not been applied yet, so
    // the function the check depends on does not exist there.
    console.error(
      `Cannot check for drift: ${fn}() returned ${res.status}.\n` +
        (res.status === 404
          ? "The schema_fingerprint migration has not been applied to the live project yet.\n" +
            "Apply supabase/migrations/ to it, then re-run."
          : body.slice(0, 400))
    );
    process.exit(2);
  }
  return res.json();
}

const live = await liveRpc("schema_fingerprint");

console.log(`repository: ${local.lines} structural facts · ${local.md5}`);
console.log(`live:       ${live.lines} structural facts · ${live.md5}`);

if (local.md5 === live.md5) {
  console.log(`\nIn step. The migrations describe the live database exactly.`);
  process.exit(0);
}

// ── drifted: say what differs, not just that something does ──────────────────

console.error(`\nDRIFT: the live database does not match supabase/migrations/.`);

const liveLines = new Set(await liveRpc("schema_fingerprint_lines").then((rows) =>
  rows.map((r) => r.line)
));
const localLines = new Set(
  run(["-At", "-c", "select line from schema_fingerprint_lines()"], "local lines")
    .split("\n")
    .filter(Boolean)
);

const onlyLive = [...liveLines].filter((l) => !localLines.has(l)).sort();
const onlyRepo = [...localLines].filter((l) => !liveLines.has(l)).sort();

if (onlyLive.length) {
  console.error(`\nIn the live database but not in the migrations (${onlyLive.length}):`);
  console.error("  — someone changed the project directly, or a migration is missing here");
  for (const l of onlyLive.slice(0, 40)) console.error(`  + ${l}`);
  if (onlyLive.length > 40) console.error(`  ... and ${onlyLive.length - 40} more`);
}
if (onlyRepo.length) {
  console.error(`\nIn the migrations but not in the live database (${onlyRepo.length}):`);
  console.error("  — a migration here has not been applied to the project yet");
  for (const l of onlyRepo.slice(0, 40)) console.error(`  - ${l}`);
  if (onlyRepo.length > 40) console.error(`  ... and ${onlyRepo.length - 40} more`);
}

process.exit(1);
