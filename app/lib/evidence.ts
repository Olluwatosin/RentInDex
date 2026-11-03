// Turning a rent lookup into evidence for the rights engine.
//
// Kept separate from both sides on purpose. tenancy.ts must not know the
// database exists — it is pure so the statute can be tested exhaustively and
// reused by the API, the share card and the WhatsApp bot. db.ts must not know
// about the Tenancy Law. This is the one place the two meet, and being a plain
// function it can be tested without either.

import type { RentLookup } from "./db";
import type { MarketEvidence } from "./tenancy";

/**
 * Which band should carry a s.37(2)(a) argument?
 *
 * The engine already answers that: rent_lookup picks a reference band by
 * geography first, then by source, and reports it as verdict_basis. Reusing
 * that choice rather than re-deriving one here keeps a single source of truth
 * for "the best comparison we have" — and means an improvement to the ladder
 * reaches the rights engine for free.
 *
 * Returns null when there is no band at all, which the rules engine treats as
 * "answer from the statute alone".
 */
export function marketEvidenceFrom(lookup: RentLookup | null): MarketEvidence | null {
  if (!lookup?.verdict_basis) return null;

  const band = lookup.verdict_basis === "actual" ? lookup.actual : lookup.asking;
  if (!band) return null;

  return {
    level: band.level,
    anyType: band.any_type,
    source: lookup.verdict_basis,
    p25: band.p25,
    p50: band.p50,
    p75: band.p75,
    n: band.n,
    area: lookup.area,
    propertyType: lookup.property_type,
  };
}
