import { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";

// Constant-time compare so a wrong secret can't be narrowed down by timing.
// Lengths are compared first (and non-secretly) because timingSafeEqual throws
// on a length mismatch.
function secretMatches(supplied: string, expected: string): boolean {
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Authorise an admin request.
 *
 * Prefers `Authorization: Bearer <secret>`. The old `?secret=` query parameter
 * still works so existing bookmarks don't break, but it should be retired: a
 * secret in the URL is written to Vercel access logs, browser history and the
 * Referer header of anything the page links to.
 */
export function isAuthorisedAdmin(req: NextRequest): boolean {
  const expected = process.env.ADMIN_SECRET;
  if (!expected) return false;

  const header = req.headers.get("authorization");
  if (header?.startsWith("Bearer ")) {
    return secretMatches(header.slice(7).trim(), expected);
  }

  const query = req.nextUrl.searchParams.get("secret");
  if (query) {
    console.warn(
      "admin: authenticated via ?secret= query parameter — use an Authorization: Bearer header instead."
    );
    return secretMatches(query, expected);
  }

  return false;
}
