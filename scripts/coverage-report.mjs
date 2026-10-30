#!/usr/bin/env node
// How much of the index can actually answer a renter's question?
//
// 2,915 listings sounds healthy until you divide it by the question people
// actually ask — "is ₦1.4m fair for a 2-bedroom in Yaba?" That question needs a
// sample for one area AND one property type, and most such cells are empty.
// This prints that, so coverage is a number we watch rather than a feeling.
//
// Reads only. Safe to run against production, which is the point — it reports on
// the real index, not a copy.
//
// Usage:
//   node scripts/coverage-report.mjs
//   node scripts/coverage-report.mjs --min-n=5 --state=Lagos
//   node scripts/coverage-report.mjs --gaps          # the thin cells, worst first

import { SUPABASE_URL, SERVICE_KEY } from "./scrapers/run-env.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  })
);

// rent_lookup's own default is 3, which is the bar for answering at all. 5 is
// the bar for answering with a straight face, so both are reported.
const MIN_N = args["min-n"] ? parseInt(String(args["min-n"]), 10) : 5;
const ONLY_STATE = args.state ? String(args.state) : null;
const SHOW_GAPS = Boolean(args.gaps);

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

// PostgREST caps a response at 1000 rows, so page through it.
async function fetchAll(table, select) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?select=${select}&order=id.asc&offset=${offset}&limit=1000`,
      {
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
      }
    );
    if (!res.ok) throw new Error(`${table} read failed (${res.status}): ${await res.text()}`);
    const batch = await res.json();
    rows.push(...batch);
    if (batch.length < 1000) return rows;
  }
}

// Mirror the engine: a row's area is its area_raw, falling back to its city.
const areaOf = (r) => (r.area_raw || "").trim() || (r.city || "").trim() || null;

const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
const bar = (share, width = 24) => {
  const filled = Math.round((share / 100) * width);
  return "█".repeat(filled) + "·".repeat(width - filled);
};

// The funnel is read alongside the index because the two questions are one
// question: how thin is the crowd half, and is anything arriving to thicken it.
async function extractionFunnel(days = 30) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/extraction_funnel`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_days: days }),
    });
    if (!res.ok) return null; // migration not applied yet — not an error here
    return await res.json();
  } catch {
    return null;
  }
}

const [listings, renters] = await Promise.all([
  fetchAll("listings_data", "id,state,city,area_raw,property_type,is_outlier,scraped_at"),
  fetchAll("renter_data", "id,state,city,area_raw,property_type,is_outlier,rent_estimate"),
]);

// Asking rows need a rent to be in a band at all; renter rows need an estimate,
// which is what the engine actually percentiles over.
const asking = listings.filter((r) => !r.is_outlier);
const actual = renters.filter((r) => !r.is_outlier && r.rent_estimate != null);

const states = new Map();

for (const [rows, kind] of [[asking, "asking"], [actual, "actual"]]) {
  for (const r of rows) {
    if (ONLY_STATE && r.state !== ONLY_STATE) continue;
    const area = areaOf(r);
    if (!area) continue;

    const st = states.get(r.state) ?? {
      state: r.state,
      asking: 0,
      actual: 0,
      areas: new Map(),
      cells: new Map(),
    };
    st[kind]++;

    const a = st.areas.get(area) ?? { asking: 0, actual: 0 };
    a[kind]++;
    st.areas.set(area, a);

    // The cell is the real unit of coverage: one area, one property type.
    // Untyped rows cannot answer a typed question, so they are not a cell.
    if (r.property_type) {
      const key = `${area} · ${r.property_type}`;
      const c = st.cells.get(key) ?? { asking: 0, actual: 0 };
      c[kind]++;
      st.cells.set(key, c);
    }
    states.set(r.state, st);
  }
}

const all = [...states.values()].sort((x, y) => y.asking + y.actual - (x.asking + x.actual));

// ENGINE_MIN_N is rent_lookup's own default — the bar for answering at all.
// MIN_N is the bar for answering with a straight face. Both are reported,
// because the gap between them is where the honest-gap handling lives.
const ENGINE_MIN_N = 3;

const totals = {
  rows: 0, cells: 0, answerable: 0, areas: 0, areasOk: 0,
  actualCells: 0, actualOk: 0, actualAtEngine: 0, answerableAtEngine: 0,
};
for (const st of all) {
  totals.rows += st.asking + st.actual;
  totals.areas += st.areas.size;
  for (const a of st.areas.values()) if (a.asking + a.actual >= MIN_N) totals.areasOk++;
  for (const c of st.cells.values()) {
    totals.cells++;
    if (c.asking + c.actual >= MIN_N) totals.answerable++;
    if (c.asking + c.actual >= ENGINE_MIN_N) totals.answerableAtEngine++;
    if (c.actual > 0) totals.actualCells++;
    if (c.actual >= MIN_N) totals.actualOk++;
    if (c.actual >= ENGINE_MIN_N) totals.actualAtEngine++;
  }
}

const w = Math.max(...all.map((s) => s.state.length), 5);
const pad = (s) => String(s).padEnd(w);
const num = (n) => String(n).padStart(6);

console.log(`\nRentInDex coverage · threshold n ≥ ${MIN_N}${ONLY_STATE ? ` · ${ONLY_STATE} only` : ""}`);
console.log(`${asking.length} asking rows · ${actual.length} actual rows · ${all.length} states\n`);

console.log(`${pad("state")} ${num("asking")} ${num("actual")}  ${"cells ok".padEnd(13)} coverage`);
console.log("─".repeat(w + 55));

for (const st of all) {
  const ok = [...st.cells.values()].filter((c) => c.asking + c.actual >= MIN_N).length;
  const share = pct(ok, st.cells.size);
  console.log(
    `${pad(st.state)} ${num(st.asking)} ${num(st.actual)}  ${String(`${ok}/${st.cells.size}`).padEnd(13)} ${bar(share)} ${String(share).padStart(3)}%`
  );
}

console.log("─".repeat(w + 55));
console.log(`
Area-and-type cells          ${totals.cells}
  answerable at n ≥ ${MIN_N}         ${String(totals.answerable).padStart(5)}  (${pct(totals.answerable, totals.cells)}%)
  answerable at n ≥ ${ENGINE_MIN_N} (engine)${String(totals.answerableAtEngine).padStart(5)}  (${pct(totals.answerableAtEngine, totals.cells)}%)
Areas at any type            ${totals.areasOk} of ${totals.areas} at n ≥ ${MIN_N}  (${pct(totals.areasOk, totals.areas)}%)

${pct(totals.answerableAtEngine, totals.cells)}% of specific questions can be answered at all. The rest fall back to a wider
band, which the engine marks and the UI says out loud — but honest-and-blind is
still blind.`);

// The crowd half is the differentiator and the only route to high confidence, so
// its coverage is reported on its own rather than folded into the total.
console.log(`
The crowd half — what people actually pay
  cells with any renter rent  ${String(totals.actualCells).padStart(5)} of ${totals.cells}
  usable at n ≥ ${ENGINE_MIN_N} (engine)     ${String(totals.actualAtEngine).padStart(5)}  ← the actual band only fires here
  usable at n ≥ ${MIN_N}             ${String(totals.actualOk).padStart(5)}`);

if (totals.actualAtEngine === 0 || totals.actualAtEngine / Math.max(totals.actualCells, 1) < 0.05) {
  console.log(`
  ⚠  The actual band is structurally dormant. ${actual.length} renter rows are spread over
     ${totals.actualCells} cells — about ${(actual.length / Math.max(totals.actualCells, 1)).toFixed(1)} rows each — so almost no cell reaches the engine's
     bar of ${ENGINE_MIN_N}. Nearly every verdict in production is therefore computed from
     asking prices, and "high confidence" (typed, area-level, actual) is
     effectively unreachable.

     The fix is concentration, not volume: collecting one more row everywhere
     keeps every cell under the bar. Submissions have to be funnelled at the
     cells already close to it — run with --gaps to see them.`);
}

// ── is anything arriving? ────────────────────────────────────────────────────

const funnel = await extractionFunnel(30);
if (funnel) {
  const total = funnel.reduce((n, o) => n + Number(o.n), 0);
  const saved = Number(funnel.find((o) => o.outcome === "saved")?.n ?? 0);
  console.log(`\nRentBot collection, last 30 days`);
  if (total === 0) {
    console.log(`  no extraction attempts recorded — either no one reached the third
  message of a conversation, or the tally has only just been deployed`);
  } else {
    console.log(`  ${saved} saved of ${total} attempts  (${pct(saved, total)}%)`);
    for (const o of funnel) {
      if (o.outcome === "saved") continue;
      console.log(`    ${String(o.n).padStart(5)}  ${o.outcome}`);
    }
    if (saved === 0) {
      console.log(`
  ⚠  Every attempt was refused. The reason above is the thing to fix — this is
     the funnel that produced zero renter rows for the whole life of the bot.`);
    }
  }
} else {
  console.log(`\nRentBot collection: no tally yet (extraction_funnel not deployed).`);
}

if (SHOW_GAPS) {
  // The most useful gaps are not the empty cells — they are the ones sitting
  // just below the bar, where a handful of rows would tip them over.
  // The useful gaps are not the empty cells — they are the ones sitting just
  // below the bar, where a handful of submissions would tip them over. Ranked on
  // the crowd half, because that is where a submission actually changes an answer.
  const nearly = [];
  for (const st of all) {
    for (const [key, c] of st.cells) {
      if (c.actual > 0 && c.actual < ENGINE_MIN_N) {
        nearly.push({
          state: st.state, key, n: c.actual,
          need: ENGINE_MIN_N - c.actual, asking: c.asking,
        });
      }
    }
  }
  nearly.sort((a, b) => b.n - a.n || b.asking - a.asking || a.state.localeCompare(b.state));

  console.log(`
Where a submission would change an answer
${nearly.length} cells hold renter rents but sit below the engine's bar of ${ENGINE_MIN_N}. These are
ranked by how close they are, then by how much asking data is there to compare
against — the top of this list is where to point the next ask.
`);
  for (const g of nearly.slice(0, 25)) {
    console.log(
      `  ${String(g.n).padStart(2)}/${ENGINE_MIN_N}  need +${g.need}  ` +
        `${String(g.asking).padStart(4)} asking  ${g.state} · ${g.key}`
    );
  }
  if (nearly.length > 25) console.log(`  ... and ${nearly.length - 25} more`);
}
