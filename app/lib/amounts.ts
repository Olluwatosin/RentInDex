// Naira amount parsing + corroboration.
//
// Why this exists: the extraction LLM is handed a full chat transcript that
// includes RentBot's OWN replies, and those replies quote market medians
// ("renters typically pay ₦1,250,000"). Left unguarded, the model happily
// reports one of those figures as the user's rent — which saves a fabricated
// renter row and feeds our published medians back into our own dataset.
//
// So: never trust a money figure the model returns unless the USER actually
// typed it. These helpers make that check deterministic.

// Extract the Naira amounts a person actually wrote.
// Handles ₦900,000 · 900000 · 800k · 1.2m · "1.2 million" · "850 thousand".
// Deliberately conservative: a bare number only counts as money if it is large
// (>= 10,000) or carries a ₦ / k / m / naira marker — so "2 bedroom", "10 hours"
// and band letters never register as rent.
export function parseAmounts(text: string): number[] {
  const out: number[] = [];
  const re = /(₦\s*)?(\d[\d,]*(?:\.\d+)?)\s*(million|thousand|naira|k|m)?/gi;

  for (const m of text.matchAll(re)) {
    const hasNairaSign = Boolean(m[1]);
    const raw = m[2].replace(/,/g, "");
    const unit = m[3]?.toLowerCase();
    const n = parseFloat(raw);
    if (!Number.isFinite(n) || n <= 0) continue;

    let value: number;
    if (unit === "k" || unit === "thousand") value = n * 1_000;
    else if (unit === "m" || unit === "million") value = n * 1_000_000;
    else if (hasNairaSign || unit === "naira" || n >= 10_000) value = n;
    else continue; // bare small number — not money

    if (value >= 10_000) out.push(value);
  }
  return out;
}

// Pull out only what the USER said from a "User: ... / Bot: ..." transcript.
// Tracks the current speaker so multi-line user messages stay attributed.
export function userTurnsOnly(conversation: string): string {
  const lines = conversation.split("\n");
  const kept: string[] = [];
  let isUser = false;
  for (const line of lines) {
    const m = /^\s*(user|bot|assistant)\s*:/i.exec(line);
    if (m) isUser = m[1].toLowerCase() === "user";
    if (isUser) kept.push(line.replace(/^\s*user\s*:/i, ""));
  }
  return kept.join("\n");
}

// Did the user plausibly state this amount? True if it matches something they
// typed, or is the midpoint of a range they typed ("800k to 1m" -> 900000),
// allowing for rounding slack.
export function amountCorroborated(value: number, stated: number[]): boolean {
  const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(1_000, b * 0.01);
  if (stated.some((s) => close(value, s))) return true;
  for (let i = 0; i < stated.length; i++) {
    for (let j = i + 1; j < stated.length; j++) {
      if (close(value, (stated[i] + stated[j]) / 2)) return true;
    }
  }
  return false;
}

// Fees are often given as a percentage of rent ("agency was 10%"), so an
// uncorroborated fee is only trustworthy if the user mentioned a percentage.
export function mentionsPercentage(text: string): boolean {
  return /\d+\s*(?:%|percent)/i.test(text);
}
