// Tests for the join between the rent index and the rights engine.

import { test } from "node:test";
import assert from "node:assert/strict";

import { marketEvidenceFrom } from "../app/lib/evidence";
import type { RentLookup, RentBand } from "../app/lib/db";

const bandOf = (over: Partial<RentBand> = {}): RentBand => ({
  level: "area",
  any_type: false,
  p25: 900_000,
  p50: 1_000_000,
  p75: 1_100_000,
  n: 12,
  ...over,
});

const lookup = (over: Partial<RentLookup> = {}): RentLookup => ({
  state: "Lagos",
  area: "Yaba",
  property_type: "2 bedroom flat",
  user_rent: null,
  asking: bandOf({ p25: 2_000_000, p50: 2_500_000, p75: 3_000_000, n: 40 }),
  actual: bandOf(),
  verdict: "no_rent",
  verdict_basis: "actual",
  confidence: "high",
  ...over,
});

test("the engine's own choice of reference band is the one used", () => {
  // rent_lookup picks by geography first, then source, and reports it as
  // verdict_basis. Re-deriving that here would be a second source of truth.
  const actual = marketEvidenceFrom(lookup())!;
  assert.equal(actual.source, "actual");
  assert.equal(actual.p25, 900_000);

  const asking = marketEvidenceFrom(lookup({ verdict_basis: "asking" }))!;
  assert.equal(asking.source, "asking");
  assert.equal(asking.p25, 2_000_000);
});

test("the band's real geography and breadth are carried across, not flattened", () => {
  const e = marketEvidenceFrom(
    lookup({ actual: bandOf({ level: "city", any_type: true }) })
  )!;
  assert.equal(e.level, "city");
  assert.equal(e.anyType, true);
});

test("no band means no evidence, so the statute answers alone", () => {
  assert.equal(marketEvidenceFrom(null), null);
  assert.equal(marketEvidenceFrom(lookup({ verdict_basis: null })), null);
  // verdict_basis naming a band we do not actually hold must not be trusted.
  assert.equal(marketEvidenceFrom(lookup({ verdict_basis: "actual", actual: null })), null);
});

test("the area and type travel with the figures", () => {
  // Without these the rules engine would have to guess what the band describes,
  // which is how a town-wide number gets labelled as a neighbourhood one.
  const e = marketEvidenceFrom(lookup({ area: "Egbeda", property_type: "mini flat" }))!;
  assert.equal(e.area, "Egbeda");
  assert.equal(e.propertyType, "mini flat");
});

test("an untyped lookup yields untyped evidence rather than an invented type", () => {
  const e = marketEvidenceFrom(lookup({ property_type: null }))!;
  assert.equal(e.propertyType, null);
});
