// Deterministic extraction of the fields the answer engine needs.
//
// Why this exists: the rent verdict is composed in code precisely because model
// output can't be trusted with money — but the *inputs* to that verdict were
// still coming from an LLM call. So when Groq retired a model, RentBot couldn't
// answer "is ₦1.8m fair for a 2-bed in Yaba" either, even though every number
// needed to answer it was already in the database.
//
// These heuristics fill in whatever the model didn't return (or couldn't,
// because it was down). They are deliberately conservative: when a field isn't
// clearly stated, they return null and let the caller fall back rather than
// guess. A wrong rent here becomes wrong money advice.

import { parseAmounts, userTurnsOnly } from "./amounts";

export interface LookupFields {
  area: string | null;
  property_type: string | null;
  annual_rent: number | null;
}

// Plausible annual rent in Naira. Below this is a fee or a typo; above it is a
// sale price that wandered into a rental conversation.
const MIN_RENT = 30_000;
const MAX_RENT = 500_000_000;

// Words that mark a figure as the rent itself rather than a fee, a deposit or a
// number of rooms.
const RENT_CONTEXT =
  /\b(rent|pay(?:ing|s)?|paid|per\s*year|per\s*annum|a\s*year|yearly|annual(?:ly)?|p\.?a\.?)\b/i;

/**
 * The renter's annual rent, when they clearly stated one.
 *
 * Requires a rent word near the figure. Without that guard a transcript like
 * "agency was ₦180,000, caution ₦200,000" hands back a deposit as the rent and
 * the user gets a confident verdict on the wrong number.
 */
export function extractAnnualRent(conversation: string): number | null {
  const userText = userTurnsOnly(conversation);

  const candidates: number[] = [];
  for (const line of userText.split(/[\n.;]/)) {
    if (!RENT_CONTEXT.test(line)) continue;
    for (const amount of parseAmounts(line)) {
      if (amount >= MIN_RENT && amount <= MAX_RENT) candidates.push(amount);
    }
  }
  if (candidates.length === 0) return null;

  // A rent line mentioning several figures ("I pay 1.8m, agency took 180k") is
  // led by the rent — it's the larger sum, and the fees are derived from it.
  return Math.max(...candidates);
}

/** Normalise an apartment description to the buckets the index uses. */
export function extractPropertyType(conversation: string): string | null {
  const t = userTurnsOnly(conversation).toLowerCase();

  if (/self[\s-]?contain(ed)?|self[\s-]?con\b|studio/.test(t)) return "Self contained";
  if (/mini[\s-]?flat/.test(t)) return "Mini flat";
  if (/duplex|bungalow|terrace|detached|semi[\s-]?detached/.test(t)) return "Duplex";
  if (/\bsingle room\b|face me i face you|\broom and parlou?r\b/.test(t)) return "Single room";

  const beds = t.match(/(\d+)\s*(?:bed(?:room)?s?|bdrm)/);
  if (beds) {
    const n = parseInt(beds[1], 10);
    if (n >= 1 && n <= 9) return `${n} bedroom flat`;
  }
  return null;
}

/**
 * Match the conversation against areas we actually hold data for.
 *
 * Matching against known areas rather than guessing a name from free text means
 * we never invent a neighbourhood the index has never heard of — and a match is
 * guaranteed to be something `rent_lookup` can answer for.
 */
export function matchKnownArea(conversation: string, knownAreas: string[]): string | null {
  const t = userTurnsOnly(conversation).toLowerCase();

  // Longest first, so "Lekki Phase 1" wins over "Lekki".
  const sorted = [...knownAreas].sort((a, b) => b.length - a.length);
  for (const area of sorted) {
    const name = area.trim();
    if (name.length < 3) continue;
    const escaped = name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`).test(t)) return area;
  }
  return null;
}

// Words that look like place names but aren't, plus the vocabulary of a rent
// question. Without this the first candidate offered up is always "Rent".
const NOT_A_PLACE = new Set([
  "rent", "rents", "flat", "flats", "house", "apartment", "bedroom", "bed",
  "self", "contained", "mini", "duplex", "room", "what", "whats", "average",
  "typical", "much", "cost", "price", "year", "annual", "fair", "check",
  "pay", "paying", "naira", "state", "area", "please", "hello", "there",
  "about", "know", "want", "help", "living", "live", "moving", "move",
]);

/**
 * Candidate neighbourhood names pulled from the user's own words, best first.
 *
 * Used only to ask the database "which state is this place in?" when the user
 * named an area but no state ("what's rent like in Gwarinpa?"). Deliberately
 * capped by the caller — each candidate costs a lookup, and a wrong guess just
 * returns no match rather than a wrong answer.
 */
export function areaCandidates(conversation: string): string[] {
  const text = userTurnsOnly(conversation);
  const out: string[] = [];

  // Strongest signal: a place stated positionally — "in Gwarinpa", "at Yaba".
  for (const m of text.matchAll(
    /\b(?:in|at|around|near)\s+([A-Za-z][A-Za-z'-]{2,}(?:\s+(?:[A-Z][A-Za-z'-]+|\d+)){0,2})/g
  )) {
    out.push(m[1].trim());
  }

  // Then any capitalised word that isn't rent vocabulary.
  for (const m of text.matchAll(/\b([A-Z][A-Za-z'-]{3,})\b/g)) {
    out.push(m[1]);
  }

  const seen = new Set<string>();
  return out
    .map((s) => s.replace(/[?.,!]+$/, "").trim())
    .filter((s) => {
      const key = s.toLowerCase();
      if (s.length < 4 || NOT_A_PLACE.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/**
 * Fill any field the model left null (or couldn't supply because it was down).
 * The model's own answers always win where it gave one.
 */
export function fillMissingFields(
  fromModel: Partial<LookupFields> | null,
  conversation: string,
  knownAreas: string[] = []
): LookupFields {
  return {
    area: fromModel?.area ?? matchKnownArea(conversation, knownAreas),
    property_type: fromModel?.property_type ?? extractPropertyType(conversation),
    annual_rent: fromModel?.annual_rent ?? extractAnnualRent(conversation),
  };
}
