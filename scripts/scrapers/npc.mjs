#!/usr/bin/env node
// NigeriaPropertyCentre scraper → listings_data (asking prices).
//
// Politeness rules (non-negotiable):
//   - robots.txt allows listing pages (checked 2026-07-15; only trovitBot and
//     */report/create* are disallowed) — re-check if this script starts failing
//   - one request every ~3s with jitter, sequential, never parallel
//   - stores structured facts only: location, type, price, url (for dedupe)
//
// Usage:
//   node scripts/scrapers/npc.mjs                     # default: priority states
//   node scripts/scrapers/npc.mjs --states=lagos,abuja --pages=5
//   node scripts/scrapers/npc.mjs --dry-run           # parse but don't insert

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ── config ────────────────────────────────────────────────────────────────────

const BASE = "https://nigeriapropertycentre.com";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const THROTTLE_MS = 2500;
const JITTER_MS = 1500;

// pages per state when --pages is not given (more supply = more pages)
const PRIORITY_PAGES = {
  lagos: 12,
  abuja: 10,
  "rivers": 4,
  ogun: 4,
  oyo: 4,
  kaduna: 3,
  enugu: 3,
  ekiti: 3,
  kwara: 3,
  ondo: 3,
  osun: 3,
  delta: 3,
  edo: 3,
  anambra: 3,
  "akwa-ibom": 2,
  kano: 2,
  plateau: 2,
  niger: 2,
  nasarawa: 2,
  benue: 2,
  "cross-river": 2,
  abia: 2,
  imo: 2,
};

const STATE_NAMES = {
  abuja: "FCT Abuja",
  "akwa-ibom": "Akwa Ibom",
  "cross-river": "Cross River",
};

const ALL_STATE_SLUGS = new Set([
  "abuja", "abia", "adamawa", "akwa-ibom", "anambra", "bauchi", "bayelsa",
  "benue", "borno", "cross-river", "delta", "ebonyi", "edo", "ekiti", "enugu",
  "gombe", "imo", "jigawa", "kaduna", "kano", "katsina", "kebbi", "kogi",
  "kwara", "lagos", "nasarawa", "niger", "ogun", "ondo", "osun", "oyo",
  "plateau", "rivers", "sokoto", "taraba", "yobe", "zamfara",
]);

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

function titleCase(slug) {
  return slug
    .split("-")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function stateName(slug) {
  return STATE_NAMES[slug] ?? titleCase(slug);
}

function parseLocationFromUrl(url) {
  // /for-rent/<type...>/<state>/<area>/<sub-area>/<id>-<slug>
  const segs = new URL(url).pathname.split("/").filter(Boolean);
  const stateIdx = segs.findIndex((s) => ALL_STATE_SLUGS.has(s));
  if (stateIdx === -1) return null;
  const tail = segs.slice(stateIdx + 1, -1); // between state and id-slug
  const area = tail[0] ? titleCase(tail[0]) : null;
  const subArea = tail[1] ? titleCase(tail[1]) : null;
  return {
    state: stateName(segs[stateIdx]),
    city: area,
    area_raw: subArea ?? area,
  };
}

function propertyType(title) {
  const t = title.toLowerCase();
  if (/self[\s-]?contain|studio/.test(t)) return "Self-contained";
  if (/mini[\s-]?flat/.test(t)) return "Mini flat";
  const beds = t.match(/(\d+)\s*(?:bed(?:room)?s?)/);
  if (beds) {
    const n = parseInt(beds[1], 10);
    if (n >= 1 && n <= 9) return `${n} Bedroom flat`;
  }
  if (/duplex|bungalow|terrace|detached/.test(t)) return "Duplex / Bungalow";
  return null;
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

// ── parsing ───────────────────────────────────────────────────────────────────

function parsePage(html) {
  // 1) listing id → url map from the ItemList JSON-LD
  const idToUrl = new Map();
  for (const m of html.matchAll(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g
  )) {
    try {
      const data = JSON.parse(m[1]);
      if (data["@type"] === "ItemList" && Array.isArray(data.itemListElement)) {
        for (const item of data.itemListElement) {
          const idm = item.url?.match(/\/(\d+)-[^/]*$/);
          if (idm) idToUrl.set(idm[1], item.url);
        }
      }
    } catch {
      /* not the block we want */
    }
  }

  // 2) per-card details
  const listings = [];
  const cards = html.split(/data-listing-card="desktop"/).slice(1);
  for (const card of cards) {
    const idm = card.match(/productId:\s*(\d+)/);
    const priceM = card.match(/₦([\d,]+)/);
    const titleM = card.match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
    if (!idm || !priceM) continue;

    const url = idToUrl.get(idm[1]);
    if (!url) continue;

    // annual rents only — skip shortlet/monthly noise for the index
    const period = card.match(/>\s*\/\s*(yr|year|annum|mo|month|day|night|wk|week)\s*</i);
    if (period && !/yr|year|annum/i.test(period[1])) continue;

    const loc = parseLocationFromUrl(url);
    if (!loc) continue;

    const price = parseInt(priceM[1].replace(/,/g, ""), 10);
    const title = titleM ? decodeEntities(titleM[1].replace(/<[^>]+>/g, "").trim()) : "";

    listings.push({
      source_site: "nigeriapropertycentre",
      listing_url: url,
      ...loc,
      property_type: propertyType(title),
      annual_rent: price,
      is_outlier: price < 50_000 || price > 100_000_000,
    });
  }
  return listings;
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
  if (!res.ok) {
    throw new Error(`Supabase insert failed (${res.status}): ${await res.text()}`);
  }
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
  const states = args.states
    ? String(args.states).split(",")
    : Object.keys(PRIORITY_PAGES);
  const fixedPages = args.pages ? parseInt(String(args.pages), 10) : null;

  if (!dryRun && (!SUPABASE_URL || !SERVICE_KEY)) {
    console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env");
    process.exit(1);
  }

  let totalParsed = 0;
  let totalInserted = 0;

  for (const state of states) {
    const pages = fixedPages ?? PRIORITY_PAGES[state] ?? 2;
    for (let page = 1; page <= pages; page++) {
      const url = `${BASE}/for-rent/flats-apartments/${state}${page > 1 ? `?page=${page}` : ""}`;
      let html;
      try {
        const res = await fetch(url, { headers: { "User-Agent": UA } });
        if (!res.ok) {
          console.error(`  ✗ ${state} p${page}: HTTP ${res.status} — stopping this state`);
          break;
        }
        html = await res.text();
      } catch (err) {
        console.error(`  ✗ ${state} p${page}: ${err.message} — stopping this state`);
        break;
      }

      const listings = parsePage(html);
      totalParsed += listings.length;

      if (listings.length === 0) {
        console.log(`  · ${state} p${page}: no listings — end of results`);
        break;
      }

      if (dryRun) {
        console.log(`  ✓ ${state} p${page}: parsed ${listings.length} (dry run)`);
        if (page === 1) console.log(JSON.stringify(listings[0], null, 2));
      } else {
        const n = await insertListings(listings);
        totalInserted += n;
        console.log(`  ✓ ${state} p${page}: ${n} listings`);
      }

      await throttle();
    }
  }

  console.log(`\nDone. Parsed ${totalParsed}${dryRun ? " (dry run, nothing inserted)" : `, sent ${totalInserted} (duplicates ignored by db)`}.`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
