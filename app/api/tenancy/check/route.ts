import { NextRequest, NextResponse } from "next/server";
import { rateLimit, ipBucket } from "@/app/lib/rate-limit";
import { buildFindings, LAGOS_TENANCY_BILL_2025 } from "@/app/lib/tenancy";

export const dynamic = "force-dynamic";

// Tenancy rights answers. No model, no database — this is statute, so the
// answer is the same every time and costs nothing to give.
//
// Only Lagos is supported, and that is a deliberate limit rather than a gap we
// are hiding. Every state has its own Recovery of Premises law and we have read
// exactly one of them. Generating thirty-six states of plausible-sounding
// tenancy law would be the same failure as quoting a ₦25m median for an Ikeja
// two-bedroom: confident, well-formatted and wrong, about something a person is
// going to act on.
const SUPPORTED_STATES = ["Lagos"];

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!(await rateLimit(ipBucket("tenancy", ip), 60, 60_000))) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const state = typeof body.state === "string" ? body.state.trim() : "Lagos";
  if (!SUPPORTED_STATES.includes(state)) {
    return NextResponse.json({
      supported: false,
      state,
      message: `We only have verified tenancy law for Lagos so far. ${state} has its own Recovery of Premises law with different notice periods and different protections, and we would rather tell you that than guess at it.`,
      supportedStates: SUPPORTED_STATES,
    });
  }

  const num = (v: unknown) => (typeof v === "number" ? v : undefined);
  const flag = (v: unknown) => v === true;
  const asked = Array.isArray(body.questions) ? body.questions : [];
  const area = typeof body.area === "string" ? body.area : null;

  // One engine call, shared with the share-card image and the link preview, so
  // a forwarded card can never disagree with the page that produced it.
  const { coverage, findings } = buildFindings({
    area,
    situation: typeof asked[0] === "string" ? (asked[0] as string) : null,
    tenancyType: typeof body.tenancyType === "string" ? body.tenancyType : null,
    monthsDemanded: num(body.monthsDemanded),
    currentRent: num(body.currentRent),
    proposedRent: num(body.proposedRent),
    agreementStatesPeriod: flag(body.agreementStatesPeriod),
    isSittingTenant: flag(body.isSittingTenant),
    lockedOut: flag(body.lockedOut),
    propertyDamaged: flag(body.propertyDamaged),
    threatened: flag(body.threatened),
    utilitiesCut: flag(body.utilitiesCut),
    hasCourtOrder: flag(body.hasCourtOrder),
  });

  return NextResponse.json(
    {
      supported: true,
      state,
      area,
      coveredByLaw: coverage.covered,
      excludedArea: coverage.matchedArea,
      findings,
      pendingReform: LAGOS_TENANCY_BILL_2025,
      disclaimer:
        "This quotes the Lagos State Tenancy Law 2011 so you can read it yourself. It is information, not legal advice, and it cannot account for what your own tenancy agreement says.",
    },
    { headers: { "Cache-Control": "public, s-maxage=3600" } }
  );
}
