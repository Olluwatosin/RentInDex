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

import { SUPABASE_URL, SERVICE_KEY, startRun, finishRun } from "./run-env.mjs";

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

// Sub-area slugs that name nothing on their own. "GRA" is not a place — Ikeja
// GRA, Magodo GRA and Ogudu GRA are three very different markets, and taking
// the bare slug merged them into one invented neighbourhood whose median then
// leaked into every lookup for their parent. Qualify these with the parent.
const GENERIC_SUBAREAS = new Set([
  "gra", "extension", "estate", "central", "north", "south", "east", "west",
  "new-site", "old-site", "main", "town", "phase-1", "phase-2", "phase-3",
  "phase-4", "phase-5", "zone-1", "zone-2", "zone-3", "zone-4", "zone-5",
]);

function parseLocationFromUrl(url) {
  // /for-rent/<type...>/<state>/<area>/<sub-area>/<id>-<slug>
  const segs = new URL(url).pathname.split("/").filter(Boolean);
  const stateIdx = segs.findIndex((s) => ALL_STATE_SLUGS.has(s));
  if (stateIdx === -1) return null;
  const tail = segs.slice(stateIdx + 1, -1); // between state and id-slug
  const area = tail[0] ? titleCase(tail[0]) : null;

  let areaRaw = area;
  if (tail[1]) {
    areaRaw = GENERIC_SUBAREAS.has(tail[1])
      ? `${titleCase(tail[0])} ${titleCase(tail[1]).toUpperCase() === "GRA" ? "GRA" : titleCase(tail[1])}`
      : titleCase(tail[1]);
  }

  return {
    state: stateName(segs[stateIdx]),
    city: area,
    area_raw: areaRaw,
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

// Neighbourhood pages linked from a state's listing page.
//
// This is the whole point of the area pass. Scraping only the state feed takes
// whatever that feed's default order surfaces, and on this site that is the
// promoted premium stock — which is how the Lagos sample ended up as 16 Lekki
// Phase 1 flats, 14 Ikate and a handful of Banana Island, with Agege, Ejigbo,
// Ikorodu and Alimosho absent entirely, and a reported ₦20m median for an Ikeja
// two-bedroom. Walking the area links instead samples the state by geography.
function parseAreaSlugs(html, stateSlug) {
  const re = new RegExp(
    `/for-rent/flats-apartments/${stateSlug}/([a-z0-9-]+)(?:/|"|\\?)`,
    "g"
  );
  const slugs = new Set();
  for (const m of html.matchAll(re)) slugs.add(m[1]);
  return [...slugs].sort();
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

  // Breadth beats depth for a representative sample: one page from each of a
  // state's neighbourhoods tells us far more about the market than ten more
  // pages of the same premium corridor.
  // Two pages per area, not one: a single page leaves most neighbourhoods with
  // a handful of listings, and a median over four flats swings wildly with the
  // next one scraped. Depth here is what makes a per-area figure stable enough
  // to publish.
  const areaPages = args["area-pages"] ? parseInt(String(args["area-pages"]), 10) : 2;
  const maxAreas = args["max-areas"] ? parseInt(String(args["max-areas"]), 10) : 60;
  const skipAreas = Boolean(args["no-areas"]);

  let totalParsed = 0;
  let totalInserted = 0;
  const perArea = new Map(); // "State — Area" -> count, for the coverage report

  async function fetchHtml(url, label) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (!res.ok) {
        console.error(`  ✗ ${label}: HTTP ${res.status}`);
        return null;
      }
      return await res.text();
    } catch (err) {
      console.error(`  ✗ ${label}: ${err.message}`);
      return null;
    }
  }

  // Scrape one listing feed (a state feed or an area feed) page by page.
  // Returns false when the feed ran dry, so the caller can stop early.
  async function harvest(baseUrl, label, pages) {
    for (let page = 1; page <= pages; page++) {
      const url = `${baseUrl}${page > 1 ? `?page=${page}` : ""}`;
      const html = await fetchHtml(url, `${label} p${page}`);
      if (!html) return false;

      const listings = parsePage(html);
      totalParsed += listings.length;

      if (listings.length === 0) {
        console.log(`  · ${label} p${page}: no listings — end of results`);
        return false;
      }

      for (const l of listings) {
        if (l.is_outlier) continue;
        const key = `${l.state} — ${l.area_raw ?? "?"}`;
        if (!perArea.has(key)) perArea.set(key, []);
        perArea.get(key).push(l.annual_rent);
      }

      if (dryRun) {
        console.log(`  ✓ ${label} p${page}: parsed ${listings.length} (dry run)`);
      } else {
        const n = await insertListings(listings);
        totalInserted += n;
        console.log(`  ✓ ${label} p${page}: ${n} listings`);
      }

      await throttle();
    }
    return true;
  }

  for (const state of states) {
    // The state feed is the biased source — it is the one ordered by the site's
    // promotion, not by geography. Once the area pass is doing the sampling,
    // going deep here only re-buys more of the same premium corridor, so take
    // two pages for stragglers and spend the request budget on areas instead.
    // PRIORITY_PAGES still applies when areas are switched off.
    const statePages = fixedPages ?? (skipAreas ? PRIORITY_PAGES[state] ?? 2 : 2);
    const stateUrl = `${BASE}/for-rent/flats-apartments/${state}`;

    // Page 1 does double duty: its listings, and the area links we walk next.
    const firstHtml = await fetchHtml(stateUrl, `${state} p1`);
    if (!firstHtml) continue;

    const areaSlugs = skipAreas ? [] : parseAreaSlugs(firstHtml, state).slice(0, maxAreas);
    console.log(`\n${state}: ${areaSlugs.length} areas linked, ${statePages} state pages`);

    await harvest(stateUrl, state, statePages);
    for (const slug of areaSlugs) {
      await harvest(`${stateUrl}/${slug}`, `${state}/${slug}`, areaPages);
    }
  }

  // Coverage report — the number to watch is how evenly listings spread across
  // areas, not the total. A big total concentrated in five premium estates is
  // exactly the sample that produced our worst published figures.
  const median = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
  };
  const naira = (n) => "₦" + n.toLocaleString("en-NG");

  const spread = [...perArea.entries()].sort((a, b) => b[1].length - a[1].length);
  const allPrices = spread.flatMap(([, xs]) => xs);
  console.log(`\nCoverage: ${spread.length} distinct areas, ${allPrices.length} priced listings.`);
  if (allPrices.length) console.log(`Overall median: ${naira(median(allPrices))}`);
  console.log("Most-sampled areas:");
  for (const [area, xs] of spread.slice(0, 15)) {
    console.log(`  ${String(xs.length).padStart(4)}  ${naira(median(xs)).padStart(14)}  ${area}`);
  }

  console.log(`\nDone. Parsed ${totalParsed}${dryRun ? " (dry run, nothing inserted)" : `, sent ${totalInserted} (duplicates ignored by db)`}.`);

  return { parsed: totalParsed, sent: totalInserted, areas: spread.length };
}

// Record the run so a scheduled failure is visible instead of silent.
const runId = await startRun("npc");
try {
  const summary = await main();
  await finishRun(runId, { ok: true, ...summary });
} catch (err) {
  console.error("Fatal:", err);
  await finishRun(runId, { ok: false, error: err?.message ?? err });
  process.exit(1);
}
