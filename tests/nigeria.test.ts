// Tests for state detection from free text.
//
// A geography mistake here is not cosmetic: it attaches a renter's submission
// to the wrong state, and then answers someone else's question from it.

import { test } from "node:test";
import assert from "node:assert/strict";

import { detectState, NIGERIAN_STATES } from "../app/lib/nigeria";

test("all 36 states and the FCT are listed", () => {
  assert.equal(NIGERIAN_STATES.length, 37);
  assert.ok(NIGERIAN_STATES.includes("FCT Abuja"));
});

test("a state is found anywhere in a sentence", () => {
  assert.equal(detectState("I live in Yaba, Lagos"), "Lagos");
  assert.equal(detectState("rent in enugu is high"), "Enugu");
  assert.equal(detectState("Port Harcourt, Rivers State"), "Rivers");
  assert.equal(detectState("Akwa Ibom"), "Akwa Ibom");
});

test("the Abuja aliases all resolve to FCT Abuja", () => {
  for (const text of ["Abuja", "I'm in FCT", "the federal capital territory", "gwarinpa, abuja"]) {
    assert.equal(detectState(text), "FCT Abuja", text);
  }
});

test("Cross River is not read as Rivers", () => {
  assert.equal(detectState("Calabar, Cross River"), "Cross River");
});

test("a state name inside a longer word is not a match", () => {
  assert.equal(detectState("I work in London"), null);
  assert.equal(detectState("ondoscope"), null);
});

test("text with no state returns null rather than a guess", () => {
  for (const text of ["I pay 900k", "", "2 bedroom flat"]) {
    assert.equal(detectState(text), null, text);
  }
});
