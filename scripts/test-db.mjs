// Runs the database golden tests against a disposable Postgres.
//
// The pricing engine lives in SQL, so testing it needs a real server. This
// script rebuilds the schema from supabase/migrations/ and runs the assertions
// in tests/db/, which means it also proves the migrations still apply cleanly —
// the thing that stops the repository drifting from the live project again.
//
// Point it at a THROWAWAY database. It creates objects and, on a database that
// already has them, the migrations are additive — but the golden tests are
// written against a known-empty index, so results on a populated database are
// meaningless. Never aim this at production.
//
//   DATABASE_URL=postgres://postgres@127.0.0.1:5432/rentindex_test npm run test:db

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const url = process.env.DATABASE_URL;

if (!url) {
  console.error(
    [
      "DATABASE_URL is not set, so the database tests cannot run.",
      "",
      "These need a throwaway Postgres with the pg_trgm extension available.",
      "The quickest local option:",
      "",
      "  createdb rentindex_test",
      "  DATABASE_URL=postgres://localhost/rentindex_test npm run test:db",
      "",
      "CI provides one as a service container — see .github/workflows/ci.yml.",
    ].join("\n")
  );
  process.exit(1);
}

const psql = (args, label) => {
  const res = spawnSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-q", ...args], {
    stdio: "inherit",
    cwd: repoRoot,
  });
  if (res.error?.code === "ENOENT") {
    console.error("psql was not found on PATH. Install the Postgres client tools.");
    process.exit(1);
  }
  if (res.status !== 0) {
    console.error(`\n${label} failed.`);
    process.exit(res.status ?? 1);
  }
};

// Supabase projects already have this; a bare Postgres does not.
psql(["-c", "create schema if not exists extensions;"], "schema setup");

const migrations = readdirSync(resolve(repoRoot, "supabase/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort();

for (const file of migrations) {
  console.log(`applying ${file}`);
  psql(["-f", `supabase/migrations/${file}`], file);
}

const tests = readdirSync(resolve(repoRoot, "tests/db"))
  .filter((f) => f.endsWith(".test.sql"))
  .sort();

for (const file of tests) {
  console.log(`running ${file}`);
  psql(["-f", `tests/db/${file}`], file);
}

console.log("\ndatabase tests passed");
