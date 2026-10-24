// Tests for the tenancy rules engine.
//
// This file guards legal advice. Every test names the section it encodes, so a
// failure tells you which provision the code stopped honouring rather than just
// that a string changed. Where the statute is genuinely ambiguous the test says
// so and pins current behaviour, rather than inventing a reading.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  checkCoverage,
  checkNotice,
  checkAdvanceRent,
  checkIncrease,
  checkEviction,
  buildFindings,
  headlineFinding,
  qualifyForExcludedArea,
  EXCLUDED_AREAS,
  LAGOS_TENANCY_BILL_2025,
  type Finding,
} from "../app/lib/tenancy";

const sections = (f: Finding) => f.citations.map((c) => c.section);

// ─── s.1(3) — the exempted areas ─────────────────────────────────────────────

test("s.1(3): the four exempted areas are outside the Law", () => {
  for (const area of EXCLUDED_AREAS) {
    const c = checkCoverage(area);
    assert.equal(c.covered, false, `${area} must not be treated as covered`);
    assert.equal(c.matchedArea, area);
    assert.ok(sections(c.finding).includes("s.1(3)"));
  }
});

test("s.1(3): exemption is detected in the forms renters actually type", () => {
  const cases: [string, string][] = [
    ["ikoyi", "Ikoyi"],
    ["Banana Island, Ikoyi", "Ikoyi"],
    ["VICTORIA ISLAND", "Victoria Island"],
    ["V.I.", "Victoria Island"],
    ["Ikeja G.R.A.", "Ikeja GRA"],
    ["Ikeja GRA", "Ikeja GRA"],
    ["Apapa", "Apapa"],
  ];
  for (const [typed, expected] of cases) {
    assert.equal(checkCoverage(typed).matchedArea, expected, `"${typed}"`);
  }
});

test("s.1(1): anywhere else in Lagos is covered", () => {
  for (const area of ["Yaba", "Egbeda", "Ikorodu", "Surulere", "Ikeja", ""]) {
    const c = checkCoverage(area);
    assert.equal(c.covered, true, `${area} should be covered`);
    assert.equal(c.matchedArea, null);
    assert.ok(sections(c.finding).includes("s.1(1)"));
  }
});

test("s.1(1): Ikeja alone is covered — only Ikeja GRA is exempt", () => {
  assert.equal(checkCoverage("Ikeja").covered, true);
  assert.equal(checkCoverage("Ikeja GRA").covered, false);
});

test("a missing area is treated as covered, not as exempt", () => {
  // Erring the other way would tell a renter they have no protection when we
  // simply failed to ask where they live.
  assert.equal(checkCoverage(null).covered, true);
});

// ─── s.13 — notice to quit ───────────────────────────────────────────────────

test("s.13(1)(a)-(e): the statutory notice periods", () => {
  const expected: [Parameters<typeof checkNotice>[0]["tenancyType"], string, string][] = [
    ["at_will", "1 week", "s.13(1)(a)"],
    ["monthly", "1 month", "s.13(1)(b)"],
    ["quarterly", "3 months", "s.13(1)(c)"],
    ["half_yearly", "3 months", "s.13(1)(d)"],
    ["yearly", "6 months", "s.13(1)(e)"],
  ];
  for (const [tenancyType, period, section] of expected) {
    const f = checkNotice({ tenancyType });
    assert.ok(f.headline.includes(period), `${tenancyType} should be ${period}: ${f.headline}`);
    assert.ok(sections(f).includes(section), `${tenancyType} should cite ${section}`);
  }
});

test("s.13(4): only quarterly, half-yearly and yearly carry the anniversary rule", () => {
  for (const t of ["quarterly", "half_yearly", "yearly"] as const) {
    assert.ok(sections(checkNotice({ tenancyType: t })).includes("s.13(4)"), t);
  }
  for (const t of ["monthly", "at_will"] as const) {
    assert.ok(!sections(checkNotice({ tenancyType: t })).includes("s.13(4)"), t);
  }
});

test("s.13(5): an expired fixed term needs no notice to quit, but still needs court", () => {
  const f = checkNotice({ tenancyType: "fixed_term" });
  assert.equal(f.verdict, "info");
  assert.deepEqual(sections(f), ["s.13(5)"]);
  assert.ok(f.detail.join(" ").includes("seven days"));
});

test("s.13(1): an agreed notice period governs over the statutory fallback", () => {
  // The most common misunderstanding in Lagos tenancy: six months is a default
  // where the agreement is silent, not a floor the agreement cannot go under.
  const f = checkNotice({ tenancyType: "yearly", agreementStatesPeriod: true });
  assert.equal(f.verdict, "depends");
  assert.ok(f.headline.includes("Your agreement decides"));
  assert.ok(f.detail.join(" ").includes("fallback, not a floor"));
});

// ─── s.4 — advance rent ──────────────────────────────────────────────────────

test("s.4(3): a new tenant may be asked for up to one year", () => {
  for (const type of ["yearly", "monthly"] as const) {
    const ok = checkAdvanceRent({ monthsDemanded: 12, isSittingTenant: false, tenancyType: type });
    assert.equal(ok.verdict, "lawful", `12 months, new ${type} tenant`);
    assert.ok(sections(ok).includes("s.4(3)"));

    const over = checkAdvanceRent({ monthsDemanded: 13, isSittingTenant: false, tenancyType: type });
    assert.equal(over.verdict, "unlawful", `13 months, new ${type} tenant`);
  }
});

test("s.4(1): a sitting monthly tenant is capped at six months", () => {
  const ok = checkAdvanceRent({ monthsDemanded: 6, isSittingTenant: true, tenancyType: "monthly" });
  assert.equal(ok.verdict, "lawful");
  assert.ok(ok.headline.includes("within the limit"));

  const over = checkAdvanceRent({ monthsDemanded: 7, isSittingTenant: true, tenancyType: "monthly" });
  assert.equal(over.verdict, "unlawful");
  assert.ok(over.headline.includes("six months"));
  assert.ok(sections(over).includes("s.4(1)"));
});

test("s.4(1): a sitting yearly tenant is capped at one year", () => {
  assert.equal(
    checkAdvanceRent({ monthsDemanded: 12, isSittingTenant: true, tenancyType: "yearly" }).verdict,
    "lawful"
  );
  assert.equal(
    checkAdvanceRent({ monthsDemanded: 24, isSittingTenant: true, tenancyType: "yearly" }).verdict,
    "unlawful"
  );
});

test("s.4(1) is silent on quarterly and half-yearly sitting tenants — we apply one year", () => {
  // The provision names only "a monthly tenant" (six months) and "a yearly
  // tenant" (one year). A sitting quarterly tenant is in neither category, and
  // the engine currently gives them the one-year limit. That is an
  // interpretation, not something the statute says, so it is pinned here and
  // flagged rather than presented as settled law. Worth a lawyer's view.
  for (const type of ["quarterly", "half_yearly"] as const) {
    const f = checkAdvanceRent({ monthsDemanded: 12, isSittingTenant: true, tenancyType: type });
    assert.equal(f.verdict, "lawful", type);
    assert.equal(
      checkAdvanceRent({ monthsDemanded: 13, isSittingTenant: true, tenancyType: type }).verdict,
      "unlawful",
      type
    );
  }
});

test("s.4(5): the offence is cited whichever way the answer goes", () => {
  // Paying over the limit is an offence for the tenant too. A renter who only
  // hears "your landlord is breaking the law" is being under-informed.
  const lawful = checkAdvanceRent({ monthsDemanded: 12, isSittingTenant: false, tenancyType: "yearly" });
  const unlawful = checkAdvanceRent({ monthsDemanded: 24, isSittingTenant: false, tenancyType: "yearly" });
  assert.ok(sections(lawful).includes("s.4(5)"));
  assert.ok(sections(unlawful).includes("s.4(5)"));
  assert.ok(unlawful.detail.join(" ").includes("offence for the tenant to pay it as well"));
});

// ─── s.37 — rent increase ────────────────────────────────────────────────────

test("s.37: an increase is never called illegal outright, and no cap is implied", () => {
  const f = checkIncrease({ currentRent: 800_000, proposedRent: 1_600_000 });
  assert.equal(f.verdict, "depends");
  assert.ok(f.headline.includes("100%"));
  assert.ok(f.headline.includes("not automatically illegal"));
  assert.ok(f.detail.join(" ").includes("no maximum percentage"));
  assert.deepEqual(sections(f), ["s.37(1)", "s.37(2)(a)", "s.37(4)"]);
});

test("s.37(2)(a): the answer points the renter at local comparables", () => {
  // This is the join between the rules engine and the rent index: the statute
  // names the evidence, and the index is the evidence.
  const f = checkIncrease({ currentRent: 800_000, proposedRent: 1_200_000 });
  assert.ok(f.detail.join(" ").includes("general level of rents"));
  assert.ok(f.actions?.join(" ").includes("comparable"));
});

test("s.37(4): the renter is told they cannot be ejected while the case runs", () => {
  const f = checkIncrease({ currentRent: 500_000, proposedRent: 900_000 });
  assert.ok(f.detail.join(" ").includes("may not eject you while the case is pending"));
});

test("a rise too small to round to 1% is still an increase", () => {
  // 0.25% rounds to zero. Reporting "that is not an increase" to a renter whose
  // rent went up is wrong, and they might act on it.
  const f = checkIncrease({ currentRent: 800_000, proposedRent: 802_000 });
  assert.ok(!f.headline.includes("not an increase"), f.headline);
  assert.ok(f.headline.includes("not automatically illegal"));
});

test("a decrease or an unchanged rent is not an increase", () => {
  assert.ok(checkIncrease({ currentRent: 1_000_000, proposedRent: 900_000 }).headline.includes("not an increase"));
  assert.ok(checkIncrease({ currentRent: 800_000, proposedRent: 800_000 }).headline.includes("not an increase"));
});

// ─── s.44 — eviction and harassment ──────────────────────────────────────────

test("s.44(1): with no self-help alleged, the answer is that only a court can evict", () => {
  const f = checkEviction({});
  assert.equal(f.verdict, "info");
  assert.equal(f.headline, "Only a court can evict you.");
  assert.deepEqual(sections(f), ["s.44(1)"]);
});

test("s.44(1): each form of self-help eviction is an offence", () => {
  const forms = ["lockedOut", "propertyDamaged", "threatened", "utilitiesCut"] as const;
  for (const form of forms) {
    const f = checkEviction({ [form]: true });
    assert.equal(f.verdict, "unlawful", form);
    assert.ok(f.headline.includes("criminal offence"), form);
  }
});

test("s.44(1): a court order does not let the landlord act personally", () => {
  const f = checkEviction({ lockedOut: true, hasCourtOrder: true });
  assert.equal(f.verdict, "unlawful");
  assert.ok(f.headline.includes("even with a court order"));
  assert.ok(f.detail.join(" ").includes("executed by court officials"));
});

// ─── the exempt-area qualification ───────────────────────────────────────────

test("an exempt-area renter is never told their landlord broke this Law", () => {
  // The regression behind commit 3aa29a1. A shared card carries the finding
  // without the page's banner, so the qualification has to live in the finding.
  const { findings } = buildFindings({
    area: "Ikoyi",
    situation: "advance_rent",
    tenancyType: "yearly",
    monthsDemanded: 24,
    isSittingTenant: false,
  });
  const headline = headlineFinding(findings);
  assert.notEqual(headline.verdict, "unlawful");
  assert.equal(headline.verdict, "depends");
  assert.ok(headline.headline.includes("Ikoyi is exempt"), headline.headline);
});

test("the same demand outside an exempt area is still called unlawful", () => {
  const { findings } = buildFindings({
    area: "Yaba",
    situation: "advance_rent",
    tenancyType: "yearly",
    monthsDemanded: 24,
    isSittingTenant: false,
  });
  assert.equal(headlineFinding(findings).verdict, "unlawful");
});

test("qualification softens a verdict without dropping the citation", () => {
  const original = checkAdvanceRent({ monthsDemanded: 24, isSittingTenant: false, tenancyType: "yearly" });
  const qualified = qualifyForExcludedArea(original, "Victoria Island");
  assert.equal(qualified.verdict, "depends");
  assert.deepEqual(sections(qualified), sections(original));
  assert.ok(qualified.detail[0].includes("does not apply in Victoria Island"));
  assert.ok(qualified.actions?.[0].includes("tenancy agreement"));
});

test("the coverage card itself is not qualified twice", () => {
  const coverage = checkCoverage("Ikoyi").finding;
  assert.deepEqual(qualifyForExcludedArea(coverage, "Ikoyi"), coverage);
});

// ─── the entry point ─────────────────────────────────────────────────────────

test("an unrecognised tenancy type falls back to yearly", () => {
  for (const given of ["fortnightly", null, undefined, ""]) {
    const { findings } = buildFindings({ area: "Yaba", situation: "notice", tenancyType: given });
    // findings[0] is always coverage; the notice answer follows it.
    assert.ok(findings[1].headline.includes("6 months"), String(given));
  }
});

test("headlineFinding falls back to coverage when nothing has a verdict", () => {
  // A notice answer is informational, so there is no "unlawful" or "lawful"
  // finding to lead with. The card then shows coverage rather than nothing.
  const { findings } = buildFindings({ area: "Yaba", situation: "notice", tenancyType: "yearly" });
  assert.ok(findings.every((f) => f.verdict === "info"));
  assert.equal(headlineFinding(findings), findings[0]);
});

test("coverage is always the first finding, whatever the situation", () => {
  for (const situation of ["increase", "advance_rent", "notice", "eviction", null]) {
    const { findings } = buildFindings({
      area: "Surulere",
      situation,
      tenancyType: "yearly",
      monthsDemanded: 12,
      currentRent: 500_000,
      proposedRent: 700_000,
    });
    assert.ok(findings[0].citations.some((c) => c.section.startsWith("s.1(")), String(situation));
  }
});

test("an incomplete query yields coverage alone rather than a guess", () => {
  // No monthsDemanded, so there is nothing to answer about advance rent.
  const { findings } = buildFindings({ area: "Yaba", situation: "advance_rent", tenancyType: "yearly" });
  assert.equal(findings.length, 1);
});

test("headlineFinding prefers the answer over the preamble", () => {
  const { findings } = buildFindings({
    area: "Yaba",
    situation: "eviction",
    tenancyType: "yearly",
    lockedOut: true,
  });
  assert.equal(headlineFinding(findings).verdict, "unlawful");
});

// ─── every citation is usable ────────────────────────────────────────────────

test("every finding carries a real citation with a quote and a source", () => {
  const all: Finding[] = [
    checkCoverage("Yaba").finding,
    checkCoverage("Ikoyi").finding,
    checkNotice({ tenancyType: "yearly" }),
    checkNotice({ tenancyType: "fixed_term" }),
    checkAdvanceRent({ monthsDemanded: 24, isSittingTenant: false, tenancyType: "yearly" }),
    checkIncrease({ currentRent: 800_000, proposedRent: 1_200_000 }),
    checkEviction({ lockedOut: true }),
  ];
  for (const f of all) {
    assert.ok(f.citations.length > 0, f.headline);
    for (const c of f.citations) {
      assert.match(c.section, /^s\.\d+/);
      assert.ok(c.quote.length > 20, `${c.section} quote too short to be the wording`);
      assert.ok(c.url.startsWith("http"), c.section);
      assert.equal(c.law, "Lagos State Tenancy Law 2011");
    }
    assert.ok(f.headline.length > 0);
    assert.ok(f.detail.length > 0);
  }
});

// ─── the 2025 Bill ───────────────────────────────────────────────────────────

test("the 2025 Bill is presented as not in force", () => {
  // Renters already repeat the 5% agency cap as though it were law. Someone
  // refusing a lawful fee on the strength of it can lose a home.
  assert.ok(LAGOS_TENANCY_BILL_2025.status.includes("not law"));
  assert.ok(LAGOS_TENANCY_BILL_2025.warning.includes("Tenancy Law 2011 is what governs"));
  assert.ok(LAGOS_TENANCY_BILL_2025.proposals.some((p) => p.includes("5%")));
});
