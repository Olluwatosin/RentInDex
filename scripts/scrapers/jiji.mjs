#!/usr/bin/env node
// Jiji.ng scraper → listings_data (asking prices).
//
// Uses Jiji's public web JSON API (api_web/v1/listing), scoped per region so
// the state is known from the request (no messy text parsing). Jiji is closer
// to the real rental market than NigeriaPropertyCentre, which helps correct
// NPC's luxury/premium skew.
//
// Politeness: robots.txt (checked 2026-08-10) allows listing pages for
// User-agent:*; only /test, /admin, /crm, /auth/facebook are disallowed.
// One request every ~3s, sequential.
//
// IMPORTANT: only ANNUAL rent is stored. Per-month/week/day listings are
// shortlets/serviced apartments — a different product that would pollute an
// annual-rent index — so they are skipped.
//
// Usage:
//   node scripts/scrapers/jiji.mjs                       # all priority regions
//   node scripts/scrapers/jiji.mjs --regions=lagos,abuja --pages=5
//   node scripts/scrapers/jiji.mjs --dry-run

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const API = "https://jiji.ng/api_web/v1/listing";
const CATEGORY = "houses-apartments-for-rent";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const THROTTLE_MS = 2500;
const JITTER_MS = 1500;

// region_slug → canonical state name; value also sets how many pages to pull.
const REGIONS = {
  lagos: { state: "Lagos", pages: 12 },
  abuja: { state: "FCT Abuja", pages: 10 },
  rivers: { state: "Rivers", pages: 5 },
  oyo: { state: "Oyo", pages: 5 },
  ogun: { state: "Ogun", pages: 4 },
  kaduna: { state: "Kaduna", pages: 4 },
  enugu: { state: "Enugu", pages: 4 },
  delta: { state: "Delta", pages: 4 },
  edo: { state: "Edo", pages: 4 },
  anambra: { state: "Anambra", pages: 3 },
  "akwa-ibom": { state: "Akwa Ibom", pages: 3 },
  kano: { state: "Kano", pages: 3 },
  plateau: { state: "Plateau", pages: 3 },
  nasarawa: { state: "Nasarawa", pages: 3 },
  "cross-river": { state: "Cross River", pages: 3 },
  ekiti: { state: "Ekiti", pages: 3 },
  ondo: { state: "Ondo", pages: 3 },
  osun: { state: "Osun", pages: 3 },
  kwara: { state: "Kwara", pages: 3 },
  imo: { state: "Imo", pages: 3 },
  abia: { state: "Abia", pages: 3 },
  benue: { state: "Benue", pages: 2 },
  niger: { state: "Niger", pages: 2 },
};

// ── env ───────────────────────────────────────────────────────────────────────
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const env = {};
for (const line of readFileSync(resolve(repoRoot, ".env"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const SUPABASE_URL = env.SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

// ── helpers ───────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const throttle = () => sleep(THROTTLE_MS + Math.random() * JITTER_MS);

function titleCase(s) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

// Return annual rent in ₦, or null if the listing isn't an annual rental.
function annualRent(advert) {
  const po = advert.price_obj || {};
  const value = typeof po.value === "number" ? po.value : null;
  if (!value || value <= 0) return null;
  const period = (po.period || advert.price_title || "").toLowerCase();
  if (/month/.test(period)) return value * 12;
  if (/week/.test(period)) return null; // shortlet
  if (/day|night/.test(period)) return null; // shortlet
  if (/sqm|per m/.test(period)) return null; // land/measurement
  // per annum / per year / (bare) → treat as annual
  return value;
}

function propertyType(advert) {
  const title = (advert.title || "").toLowerCase();
  if (/self[\s-]?contain|studio/.test(title)) return "Self-contained";
  if (/mini[\s-]?flat/.test(title)) return "Mini flat";
  const bedAttr = (advert.attrs || []).find((a) => /bedroom/i.test(a.name));
  const beds = bedAttr ? parseInt(bedAttr.value, 10) : NaN;
  if (!Number.isNaN(beds)) {
    if (beds >= 4) return "4+ bedroom";
    if (beds >= 1) return `${beds} Bedroom flat`;
  }
  const t = title.match(/(\d+)\s*bed/);
  if (t) {
    const n = parseInt(t[1], 10);
    if (n >= 4) return "4+ bedroom";
    if (n >= 1) return `${n} Bedroom flat`;
  }
  if (/duplex|bungalow|terrace|detached/.test(title)) return "Duplex / Bungalow";
  return null;
}

function areaOf(advert) {
  // region_name is the neighbourhood when region-scoped (e.g. "Lekki", "Maitama").
  const name = advert.region_name || "";
  return name ? titleCase(name.replace(/\s*\/\s*.*state$/i, "").trim()) : null;
}

function cleanUrl(url) {
  if (!url) return null;
  const path = url.split("?")[0]; // strip volatile query params so dedupe is stable
  return path.startsWith("http") ? path : `https://jiji.ng${path}`;
}

// ── storage ───────────────────────────────────────────────────────────────────
async function insertListings(rows) {
  if (rows.length === 0) return 0;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/listings_data?on_conflict=source_site,listing_url`,
    {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=ignore-duplicates,return=minimal",
      },
      body: JSON.stringify(rows),
    }
  );
  if (!res.ok) throw new Error(`Supabase insert failed (${res.status}): ${await res.text()}`);
  return rows.length;
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, "").split("=");
      return [k, v ?? true];
    })
  );
  const dryRun = Boolean(args["dry-run"]);
  const regions = args.regions ? String(args.regions).split(",") : Object.keys(REGIONS);
  const fixedPages = args.pages ? parseInt(String(args.pages), 10) : null;

  if (!dryRun && (!SUPABASE_URL || !SERVICE_KEY)) {
    console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env");
    process.exit(1);
  }

  let totalParsed = 0;
  let totalSent = 0;
  let skippedNonAnnual = 0;

  for (const region of regions) {
    const cfg = REGIONS[region] ?? { state: titleCase(region), pages: 2 };
    const pages = fixedPages ?? cfg.pages;
    for (let page = 1; page <= pages; page++) {
      const url = `${API}?slug=${CATEGORY}&webp=true&page=${page}&region_slug=${region}`;
      let json;
      try {
        const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
        if (!res.ok) {
          console.error(`  ✗ ${region} p${page}: HTTP ${res.status} — stopping region`);
          break;
        }
        json = await res.json();
      } catch (err) {
        console.error(`  ✗ ${region} p${page}: ${err.message} — stopping region`);
        break;
      }

      const adverts = json?.adverts_list?.adverts ?? [];
      if (adverts.length === 0) {
        console.log(`  · ${region} p${page}: no adverts — end of results`);
        break;
      }

      const rows = [];
      for (const ad of adverts) {
        const rent = annualRent(ad);
        if (rent == null) {
          skippedNonAnnual++;
          continue;
        }
        const listing_url = cleanUrl(ad.url);
        if (!listing_url) continue;
        rows.push({
          source_site: "jiji",
          listing_url,
          state: cfg.state,
          city: areaOf(ad),
          area_raw: areaOf(ad),
          property_type: propertyType(ad),
          annual_rent: rent,
          is_outlier: rent < 50_000 || rent > 100_000_000,
        });
      }
      totalParsed += rows.length;

      if (dryRun) {
        console.log(`  ✓ ${region} p${page}: parsed ${rows.length} (dry run)`);
        if (page === 1 && rows[0]) console.log(JSON.stringify(rows[0], null, 2));
      } else {
        totalSent += await insertListings(rows);
        console.log(`  ✓ ${region} p${page}: ${rows.length} listings`);
      }

      await throttle();
    }
  }

  console.log(
    `\nDone. Parsed ${totalParsed}, skipped ${skippedNonAnnual} non-annual (shortlets)` +
      `${dryRun ? " (dry run)" : `, sent ${totalSent} (dupes ignored by db)`}.`
  );
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
