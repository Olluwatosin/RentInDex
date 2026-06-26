// In-memory rate limiter — resets on serverless cold starts (best-effort protection)
const store = new Map<string, number[]>();

export function rateLimit(ip: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;
  const hits = (store.get(ip) ?? []).filter((t) => t > cutoff);
  if (hits.length >= limit) return false;
  hits.push(now);
  store.set(ip, hits);
  return true;
}
