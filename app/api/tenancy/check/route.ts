import { NextRequest, NextResponse } from "next/server";
import { rateLimit, ipBucket } from "@/app/lib/rate-limit";
import {
  checkCoverage,
  checkNotice,
  checkAdvanceRent,
  checkIncrease,
  checkEviction,
  LAGOS_TENANCY_BILL_2025,
  TenancyType,
  Finding,
} from "@/app/lib/tenancy";

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

const TENANCY_TYPES: TenancyType[] = [
  "at_will", "monthly", "quarterly", "half_yearly", "yearly", "fixed_term",
];

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
      message:
        `We only have verified tenancy law for Lagos so far. ${state} has its own Recovery of Premises law with different notice periods and different protections, and we would rather tell you that than guess at it.`,
      supportedStates: SUPPORTED_STATES,
    });
  }

  const area = typeof body.area === "string" ? body.area : null;
  const coverage = checkCoverage(area);

  const findings: Finding[] = [coverage.finding];

  const tenancyType: TenancyType = TENANCY_TYPES.includes(body.tenancyType as TenancyType)
    ? (body.tenancyType as TenancyType)
    : "yearly";

  const asked = Array.isArray(body.questions)
    ? (body.questions as unknown[]).filter((q): q is string => typeof q === "string")
    : [];

  if (asked.includes("notice")) {
    findings.push(
      checkNotice({
        tenancyType,
        agreementStatesPeriod: body.agreementStatesPeriod === true,
      })
    );
  }

  if (asked.includes("advance_rent") && typeof body.monthsDemanded === "number") {
    findings.push(
      checkAdvanceRent({
        monthsDemanded: body.monthsDemanded,
        isSittingTenant: body.isSittingTenant === true,
        tenancyType,
      })
    );
  }

  if (
    asked.includes("increase") &&
    typeof body.currentRent === "number" &&
    typeof body.proposedRent === "number"
  ) {
    findings.push(
      checkIncrease({
        currentRent: body.currentRent,
        proposedRent: body.proposedRent,
      })
    );
  }

  if (asked.includes("eviction")) {
    findings.push(
      checkEviction({
        lockedOut: body.lockedOut === true,
        propertyDamaged: body.propertyDamaged === true,
        threatened: body.threatened === true,
        utilitiesCut: body.utilitiesCut === true,
        hasCourtOrder: body.hasCourtOrder === true,
      })
    );
  }

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
