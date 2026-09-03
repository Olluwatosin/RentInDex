import { dbConfigured, rateLimitHit } from "./db";

// Rate limiting, shared across serverless instances.
//
// This used to be an in-memory Map. On Vercel that is per-lambda and resets on
// every cold start, so the two endpoints it guarded — one that writes to the
// dataset, one that spends LLM tokens — were effectively unlimited. Counting in
// Postgres is slower but it is the only place all instances can agree.
//
// Fails OPEN. A rate limiter that takes the site down when the database blinks
// has caused a worse outage than the abuse it was preventing; the caller-side
// guards (server-owned transcripts, corroboration, plausibility) are what
// actually protect the data.

export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  if (!dbConfigured()) return true;
  try {
    return await rateLimitHit(key, limit, Math.ceil(windowMs / 1000));
  } catch (err) {
    console.error("rate limit check failed, allowing request:", err);
    return true;
  }
}

/** Bucket key for a request, namespaced so endpoints don't share a budget. */
export function ipBucket(scope: string, ip: string): string {
  return `${scope}:${ip}`;
}
