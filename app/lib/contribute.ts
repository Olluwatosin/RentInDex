// Asking for the one thing that would close this gap.
//
// The crowd half of the index is spread impossibly thin: 202 usable rows over
// 186 area-and-type cells, about 1.1 each, against an engine that needs 3 in a
// cell before it will quote one. Three cells in the country clear that bar, so
// almost every answer we give comes from asking prices rather than from what
// people actually pay — and "high confidence" is unreachable.
//
// Volume does not fix that. One more row everywhere leaves every cell short;
// only concentration helps. So the ask stops being "help us grow our data" and
// becomes a specific, finishable thing about the cell the renter is standing
// in: how many have reported it, and how many more it needs. A reader can tell
// whether answering matters. They cannot tell that from an appeal.
//
// Pure on purpose — no I/O, no Next — so the wording is testable and the
// WhatsApp bot can reuse it unchanged.

import type { CellProgress } from "./db";

/** The explicit ask, for when the renter has not given us their rent yet. */
export function concentrationAsk(p: CellProgress | null): string | null {
  if (!p || p.has_band) return null;

  const what = p.property_type ? `a ${p.property_type}` : "a place";
  const where = p.area;

  if (p.typed_n === 0) {
    return (
      `👉 Nobody has told me what they actually pay for ${what} in ${where} yet — everything above is ` +
      `from listings or a wider area. If you rent there, tell me your yearly rent and you would be the ` +
      `first. ${p.min_n} is all it takes before ${where} gets a figure of its own.`
    );
  }

  const sofar = p.typed_n === 1 ? "One renter has" : `${p.typed_n} renters have`;
  const more = p.needed === 1 ? "One more" : `${p.needed} more`;
  return (
    `👉 ${sofar} told me what they pay for ${what} in ${where}. ${more} and I can stop quoting you a ` +
    `wider estimate and give ${where} its own number. If you rent there, what do you pay?`
  );
}

/**
 * The factual version, for when the renter has already given us their rent.
 *
 * Deliberately does not thank them or say their rent has been added: the save
 * happens later, asynchronously, and can still be refused by the extraction
 * guards. Only a confirmed write gets to claim one — anything else is a promise
 * we might not keep.
 */
export function concentrationNote(p: CellProgress | null): string | null {
  if (!p || p.has_band) return null;
  const what = p.property_type ? `a ${p.property_type}` : "a place";
  const reported =
    p.typed_n === 0
      ? `no renter has yet reported ${what} in ${p.area}`
      : p.typed_n === 1
      ? `just one renter has reported ${what} in ${p.area}`
      : `only ${p.typed_n} renters have reported ${what} in ${p.area}`;
  const more = p.needed === 1 ? "One more" : `${p.needed} more`;
  return `📊 Why that's an estimate: ${reported}, so I'm leaning on wider data. ${more} and ${p.area} gets a figure of its own.`;
}
