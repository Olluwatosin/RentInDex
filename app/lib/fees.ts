// Move-in fee analysis, parsed from the survey's free-text answers.
//
// The numeric fee columns (agency_fee, caution_deposit, ...) are empty for the
// whole survey import — the real answers live in the *_raw text columns in the
// shape the survey collected them:
//
//   "No"                                  -> answered, didn't pay
//   "Yes: 10% of annual rent"             -> paid, 10% of rent
//   "Yes: above 20%"                      -> paid, at least 20%
//   "Yes: Paid a fixed amount; 50,000"    -> paid, a flat ₦50,000
//   "Yes"                                 -> paid, structure unknown
//
// Everything the calculator quotes comes from parsing these, so a fee we can't
// interpret is counted as "paid" but never invented into a number.

export interface ParsedFee {
  answered: boolean;
  paid: boolean;
  /** Percentage of annual rent, when the renter gave one. */
  pct: number | null;
  /** True when the answer was "above N%" — pct is a floor, not the value. */
  isFloor: boolean;
  /** Flat Naira amount, when the renter gave one instead of a percentage. */
  fixed: number | null;
}

// Amounts appear as "50,000", "#30,000", "50k", "100,000.00". Anything under
// ₦1,000 is a typo or a stray digit ("10", "2500" against a 20% answer), not a
// real fee — treat those as unparseable rather than guessing.
function parseFixedAmount(text: string): number | null {
  const tail = text.includes(";") ? text.slice(text.indexOf(";") + 1) : text;
  const m = tail.match(/(\d[\d,]*(?:\.\d+)?)\s*(k)?/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const value = m[2] ? n * 1_000 : n;
  return value >= 1_000 ? value : null;
}

export function parseFee(raw: string | null): ParsedFee {
  const none: ParsedFee = { answered: false, paid: false, pct: null, isFloor: false, fixed: null };
  if (raw == null || raw.trim() === "") return none;

  const text = raw.trim();
  if (/^no\b/i.test(text)) return { answered: true, paid: false, pct: null, isFloor: false, fixed: null };

  const pctMatch = text.match(/(\d+(?:\.\d+)?)\s*%/);
  const isFloor = /above/i.test(text);
  const pct = pctMatch ? parseFloat(pctMatch[1]) : null;
  // A percentage answer may also carry a stray amount ("10% of annual rent; 50"),
  // and the percentage is the reliable half — so only read a flat amount when no
  // percentage was given. Not all flat answers say "fixed" ("Yes: #120,000"), so
  // key off the absence of a percentage rather than the wording.
  const fixed = pct == null ? parseFixedAmount(text) : null;

  return { answered: true, paid: true, pct, isFloor, fixed };
}

export interface FeeStat {
  key: FeeKey;
  label: string;
  /** How the fee is described to renters, in plain language. */
  note: string;
  answered: number;
  paidCount: number;
  /** Share of those who answered who paid this fee at all. */
  paidPct: number;
  /** Median percentage of annual rent, among those who gave a percentage. */
  medianPct: number | null;
  pctCount: number;
  /** Most commonly reported percentage, with how many reported it. */
  modePct: number | null;
  modeCount: number;
  /** Median flat amount, among those who paid a fixed sum instead. */
  medianFixed: number | null;
  fixedCount: number;
}

export type FeeKey = "agency" | "finder" | "caution" | "service";

export interface FeeRow {
  agency_fee_raw: string | null;
  finder_fee_raw: string | null;
  caution_deposit_raw: string | null;
  service_charge_raw: string | null;
  is_outlier?: boolean;
  state?: string | null;
}

const FEE_META: {
  key: FeeKey;
  label: string;
  note: string;
  column: keyof FeeRow;
}[] = [
  {
    key: "agency",
    label: "Agency / legal fee",
    note: "The survey asked about agency and lawyer fees together, so this covers both.",
    column: "agency_fee_raw",
  },
  {
    key: "finder",
    label: "Finder's fee",
    note: "Paid to whoever showed you the place — often on top of the agency fee.",
    column: "finder_fee_raw",
  },
  {
    key: "caution",
    label: "Caution / security deposit",
    note: "Refundable in principle. Renters often report difficulty getting it back.",
    column: "caution_deposit_raw",
  },
  {
    key: "service",
    label: "Service charge",
    note: "Common in estates and serviced flats; usually recurring, not one-off.",
    column: "service_charge_raw",
  },
];

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mode(values: number[]): { value: number | null; count: number } {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: number | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return { value: best, count: bestCount };
}

export function computeFeeStats(rows: FeeRow[]): FeeStat[] {
  const clean = rows.filter((r) => !r.is_outlier);

  return FEE_META.map(({ key, label, note, column }) => {
    const parsed = clean
      .map((r) => parseFee((r[column] as string | null) ?? null))
      .filter((p) => p.answered);

    const paid = parsed.filter((p) => p.paid);
    const pctValues = paid.map((p) => p.pct).filter((v): v is number => v != null);
    const fixedValues = paid.map((p) => p.fixed).filter((v): v is number => v != null);
    const m = mode(pctValues);

    return {
      key,
      label,
      note,
      answered: parsed.length,
      paidCount: paid.length,
      paidPct: parsed.length ? Math.round((paid.length / parsed.length) * 100) : 0,
      medianPct: median(pctValues),
      pctCount: pctValues.length,
      modePct: m.value,
      modeCount: m.count,
      medianFixed: median(fixedValues),
      fixedCount: fixedValues.length,
    };
  });
}
