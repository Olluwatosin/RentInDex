// Tests for move-in fee parsing.
//
// The survey collected fees as free text, and the calculator quotes what comes
// out of this parser. A fee we cannot interpret must count as paid but never be
// invented into a number — an invented fee is the thing this product exists to
// expose.

import { test } from "node:test";
import assert from "node:assert/strict";

import { parseFee, computeFeeStats, type FeeRow } from "../app/lib/fees";

test("the survey's answer shapes are each read correctly", () => {
  assert.deepEqual(parseFee("No"), {
    answered: true, paid: false, pct: null, isFloor: false, fixed: null,
  });
  assert.deepEqual(parseFee("Yes: 10% of annual rent"), {
    answered: true, paid: true, pct: 10, isFloor: false, fixed: null,
  });
  assert.deepEqual(parseFee("Yes: above 20%"), {
    answered: true, paid: true, pct: 20, isFloor: true, fixed: null,
  });
  assert.deepEqual(parseFee("Yes: Paid a fixed amount; 50,000"), {
    answered: true, paid: true, pct: null, isFloor: false, fixed: 50_000,
  });
  assert.deepEqual(parseFee("Yes"), {
    answered: true, paid: true, pct: null, isFloor: false, fixed: null,
  });
});

test("no answer is distinguished from an answer of no", () => {
  // Someone who did not answer must not be counted as someone who paid nothing.
  for (const empty of [null, "", "   "]) {
    assert.equal(parseFee(empty).answered, false, JSON.stringify(empty));
  }
  assert.equal(parseFee("No").answered, true);
  assert.equal(parseFee("No").paid, false);
});

test("'above N%' marks the percentage as a floor, not the value", () => {
  const f = parseFee("Yes: above 20%");
  assert.equal(f.pct, 20);
  assert.equal(f.isFloor, true, "quoting 20% as the figure would understate it");
});

test("a stray digit alongside a percentage is ignored", () => {
  // "10% of annual rent; 50" — the percentage is the reliable half.
  const f = parseFee("Yes: 10% of annual rent; 50");
  assert.equal(f.pct, 10);
  assert.equal(f.fixed, null);
});

test("an amount too small to be a real fee is not guessed at", () => {
  for (const text of ["Yes: Paid a fixed amount; 10", "Yes: 500"]) {
    const f = parseFee(text);
    assert.equal(f.paid, true, `${text} still counts as paid`);
    assert.equal(f.fixed, null, `${text} must not produce a number`);
  }
});

test("flat amounts are read with or without the word 'fixed'", () => {
  assert.equal(parseFee("Yes: #120,000").fixed, 120_000);
  assert.equal(parseFee("Yes: 50k").fixed, 50_000);
  assert.equal(parseFee("Yes: Paid a fixed amount; 100,000.00").fixed, 100_000);
});

const row = (over: Partial<FeeRow> = {}): FeeRow => ({
  agency_fee_raw: null,
  finder_fee_raw: null,
  caution_deposit_raw: null,
  service_charge_raw: null,
  ...over,
});

test("stats are computed over the four fees the survey asked about", () => {
  const stats = computeFeeStats([row()]);
  assert.deepEqual(stats.map((s) => s.key), ["agency", "finder", "caution", "service"]);
});

test("the paid share counts only those who answered", () => {
  const rows = [
    row({ agency_fee_raw: "Yes: 10% of annual rent" }),
    row({ agency_fee_raw: "Yes: 10% of annual rent" }),
    row({ agency_fee_raw: "No" }),
    row({ agency_fee_raw: null }), // did not answer — must not dilute the share
  ];
  const agency = computeFeeStats(rows).find((s) => s.key === "agency")!;
  assert.equal(agency.answered, 3);
  assert.equal(agency.paidCount, 2);
  assert.equal(agency.paidPct, 67);
});

test("median and mode are taken only from renters who gave a percentage", () => {
  const rows = [
    row({ agency_fee_raw: "Yes: 5%" }),
    row({ agency_fee_raw: "Yes: 10%" }),
    row({ agency_fee_raw: "Yes: 10%" }),
    row({ agency_fee_raw: "Yes: 20%" }),
    row({ agency_fee_raw: "Yes" }),            // paid, no figure
    row({ agency_fee_raw: "Yes: #150,000" }),  // paid, flat sum
  ];
  const agency = computeFeeStats(rows).find((s) => s.key === "agency")!;
  assert.equal(agency.pctCount, 4);
  assert.equal(agency.medianPct, 10);
  assert.equal(agency.modePct, 10);
  assert.equal(agency.modeCount, 2);
  assert.equal(agency.fixedCount, 1);
  assert.equal(agency.medianFixed, 150_000);
});

test("outlier rows are excluded from every statistic", () => {
  const rows = [
    row({ agency_fee_raw: "Yes: 10%" }),
    row({ agency_fee_raw: "Yes: 900%", is_outlier: true }),
  ];
  const agency = computeFeeStats(rows).find((s) => s.key === "agency")!;
  assert.equal(agency.answered, 1);
  assert.equal(agency.medianPct, 10);
});

test("no data yields nulls rather than zeros", () => {
  // A zero median would read as "nobody pays an agency fee", which is a claim.
  const agency = computeFeeStats([row()]).find((s) => s.key === "agency")!;
  assert.equal(agency.answered, 0);
  assert.equal(agency.medianPct, null);
  assert.equal(agency.medianFixed, null);
  assert.equal(agency.paidPct, 0);
});
