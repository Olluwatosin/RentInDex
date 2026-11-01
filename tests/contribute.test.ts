// Tests for the contribution ask.
//
// This copy exists to solve a measured problem: 202 renter rows spread over 186
// area-and-type cells means almost no cell reaches the engine's bar of 3, so the
// crowd band — the whole differentiator — almost never fires. Volume does not
// fix that; concentration does. These tests guard the two properties that make
// the ask work: it is *specific* about the cell, and it never *claims* anything
// we have not actually done.

import { test } from "node:test";
import assert from "node:assert/strict";

import { concentrationAsk, concentrationNote } from "../app/lib/contribute";
import type { CellProgress } from "../app/lib/db";

const cell = (over: Partial<CellProgress> = {}): CellProgress => ({
  state: "Lagos",
  area: "Yaba",
  property_type: "2 bedroom flat",
  typed_n: 2,
  area_n: 5,
  min_n: 3,
  needed: 1,
  has_band: false,
  ...over,
});

test("the ask names how many have reported and how many more are needed", () => {
  // The whole point: a reader can tell whether answering matters.
  const ask = concentrationAsk(cell())!;
  assert.match(ask, /2 renters have/);
  assert.match(ask, /One more/);
  assert.match(ask, /Yaba/);
  assert.match(ask, /2 bedroom flat/);
  assert.match(ask, /what do you pay\?/i);
});

test("a cell nobody has reported asks for the first number", () => {
  const ask = concentrationAsk(cell({ typed_n: 0, needed: 3 }))!;
  assert.match(ask, /Nobody has told me/);
  assert.match(ask, /you would be the first/i);
  assert.match(ask, /3 is all it takes/);
});

test("counts are pluralised, because this copy is the product's voice", () => {
  assert.match(concentrationAsk(cell({ typed_n: 1, needed: 2 }))!, /One renter has/);
  assert.match(concentrationAsk(cell({ typed_n: 1, needed: 2 }))!, /2 more/);
  assert.match(concentrationAsk(cell({ typed_n: 2, needed: 1 }))!, /2 renters have/);
  assert.match(concentrationAsk(cell({ typed_n: 2, needed: 1 }))!, /One more and/);
});

test("a cell that already has a band is not asked about", () => {
  // Asking for what we already have wastes the one moment the renter is willing
  // to answer, and reads as though we weren't listening.
  assert.equal(concentrationAsk(cell({ has_band: true, typed_n: 4, needed: 0 })), null);
  assert.equal(concentrationNote(cell({ has_band: true, typed_n: 4, needed: 0 })), null);
});

test("no progress figure means no ask at all", () => {
  // Better to say nothing than to invent a number — the same rule that governs
  // every band in this product.
  assert.equal(concentrationAsk(null), null);
  assert.equal(concentrationNote(null), null);
});

test("an untyped cell still asks, without inventing a property type", () => {
  const ask = concentrationAsk(cell({ property_type: null }))!;
  assert.match(ask, /a place in Yaba/);
  assert.ok(!ask.includes("null"), ask);
  assert.ok(!ask.includes("undefined"), ask);
});

test("the note explains why the number is an estimate", () => {
  const note = concentrationNote(cell())!;
  assert.match(note, /Why that's an estimate/);
  assert.match(note, /only 2 renters have reported/);
  assert.match(note, /One more and Yaba gets a figure of its own/);
});

test("the note never claims the rent has been saved", () => {
  // The save happens later, asynchronously, and the extraction guards can still
  // refuse it. Only a confirmed write may thank anyone — a promise we might not
  // keep is worse than no promise. RentBot has a separate, save-gated
  // confirmation for exactly this reason.
  for (const p of [cell(), cell({ typed_n: 0, needed: 3 }), cell({ typed_n: 1, needed: 2 })]) {
    const note = concentrationNote(p)!;
    assert.ok(!/thank/i.test(note), note);
    assert.ok(!/added|saved|recorded|logged/i.test(note), note);
  }
});

test("the note reads correctly for one and for none", () => {
  assert.match(concentrationNote(cell({ typed_n: 1, needed: 2 }))!, /just one renter has reported/);
  assert.match(concentrationNote(cell({ typed_n: 0, needed: 3 }))!, /no renter has yet reported/);
});

test("neither message ever promises a cap or a certainty it cannot keep", () => {
  const all = [
    concentrationAsk(cell()),
    concentrationAsk(cell({ typed_n: 0, needed: 3 })),
    concentrationNote(cell()),
    concentrationNote(cell({ typed_n: 0, needed: 3 })),
  ].filter((s): s is string => s != null);

  for (const msg of all) {
    // No figure should appear that we did not take from the cell itself.
    const numbers = msg.match(/\d+/g) ?? [];
    for (const n of numbers) {
      assert.ok(["0", "1", "2", "3"].includes(n), `unexpected number ${n} in: ${msg}`);
    }
    assert.ok(msg.length < 320, `too long for a WhatsApp-style reply: ${msg.length}`);
  }
});
