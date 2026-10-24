// Tests for Naira parsing and corroboration.
//
// These guard the dataset against itself. RentBot quotes market medians in its
// own replies; the extraction model reads the whole transcript, including those
// replies. Without corroboration it reports our own published median back as a
// renter's rent, and the index starts citing itself as evidence.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parseAmounts,
  userTurnsOnly,
  amountCorroborated,
  mentionsPercentage,
} from "../app/lib/amounts";

test("money is read in the forms renters write it", () => {
  const cases: [string, number[]][] = [
    ["₦900,000", [900_000]],
    ["900000", [900_000]],
    ["800k", [800_000]],
    ["1.2m", [1_200_000]],
    ["1.2 million", [1_200_000]],
    ["850 thousand", [850_000]],
    ["I pay 1,500,000 naira", [1_500_000]],
    ["₦ 2,000,000", [2_000_000]],
    ["between 800k and 1.2m", [800_000, 1_200_000]],
  ];
  for (const [text, expected] of cases) {
    assert.deepEqual(parseAmounts(text), expected, text);
  }
});

test("things that are not money are not read as money", () => {
  // "2 bedroom" and "10 hours" appear in nearly every conversation.
  for (const text of ["2 bedroom", "10 hours of power", "band A", "I have 3 kids", "500"]) {
    assert.deepEqual(parseAmounts(text), [], text);
  }
});

test("a bare number only counts as money once it is large enough to be rent", () => {
  assert.deepEqual(parseAmounts("9999"), []);
  assert.deepEqual(parseAmounts("10000"), [10_000]);
});

test("only the renter's own turns are read from a transcript", () => {
  const transcript = [
    "User: I live in Yaba",
    "Bot: Renters in Yaba typically pay ₦1,250,000 for a 2 bedroom",
    "User: I pay 800k",
    "Assistant: That is below the typical ₦1,250,000",
  ].join("\n");

  const said = parseAmounts(userTurnsOnly(transcript));
  assert.deepEqual(said, [800_000]);
  assert.ok(!said.includes(1_250_000), "the bot's own median must never be attributed to the renter");
});

test("a multi-line renter message stays attributed to the renter", () => {
  const transcript = ["User: my rent is", "900,000 a year", "Bot: thanks"].join("\n");
  assert.deepEqual(parseAmounts(userTurnsOnly(transcript)), [900_000]);
});

test("the bot's median is not corroborated by what the renter said", () => {
  // The exact failure mode: the model returns 1,250,000 as the renter's rent.
  const stated = parseAmounts(userTurnsOnly("User: I pay 800k\nBot: typically ₦1,250,000"));
  assert.equal(amountCorroborated(1_250_000, stated), false);
  assert.equal(amountCorroborated(800_000, stated), true);
});

test("corroboration allows rounding slack but not a different figure", () => {
  assert.equal(amountCorroborated(900_000, [900_000]), true);
  assert.equal(amountCorroborated(901_000, [900_000]), true, "1% slack");
  assert.equal(amountCorroborated(1_200_000, [900_000]), false);
});

test("the midpoint of a stated range is corroborated", () => {
  // "between 800k and 1m" is a real answer; 900,000 is a fair reading of it.
  const stated = parseAmounts("between 800k and 1m");
  assert.equal(amountCorroborated(900_000, stated), true);
  assert.equal(amountCorroborated(1_500_000, stated), false);
});

test("percentages are detected so a fee given as a share of rent is trusted", () => {
  for (const text of ["agency was 10%", "they charged 10 percent", "5%"]) {
    assert.equal(mentionsPercentage(text), true, text);
  }
  for (const text of ["agency was 100k", "no fee"]) {
    assert.equal(mentionsPercentage(text), false, text);
  }
});
