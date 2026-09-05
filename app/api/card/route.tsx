import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { buildFindings, headlineFinding } from "@/app/lib/tenancy";

export const runtime = "edge";

// The share card.
//
// A forwarded WhatsApp message is the distribution channel this project
// actually has, and a link with no preview is a grey rectangle nobody opens.
// This renders the verdict as the link's image, so a forward shows the answer
// and the quoted section before anyone taps anything.
//
// It runs the same buildFindings() as the page and the API, so the card cannot
// drift from the answer that produced it.

const COLOURS = {
  unlawful: { chip: "#DC2626", label: "AGAINST THE LAW" },
  lawful: { chip: "#059669", label: "WITHIN THE LAW" },
  depends: { chip: "#D97706", label: "YOU HAVE A ROUTE" },
  info: { chip: "#64748B", label: "KNOW THIS" },
} as const;

// Satori has no text-overflow, so long strings are trimmed here rather than
// silently overflowing the card.
const clamp = (s: string, n: number) =>
  s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const numOf = (k: string) => {
    const v = Number(p.get(k));
    return Number.isFinite(v) && v > 0 ? v : undefined;
  };

  const { findings } = buildFindings({
    area: p.get("area"),
    situation: p.get("situation"),
    tenancyType: p.get("type"),
    monthsDemanded: numOf("months"),
    currentRent: numOf("from"),
    proposedRent: numOf("to"),
    agreementStatesPeriod: p.get("agreed") === "1",
    isSittingTenant: p.get("sitting") === "1",
    lockedOut: p.get("lockedOut") === "1",
    propertyDamaged: p.get("damaged") === "1",
    threatened: p.get("threatened") === "1",
    utilitiesCut: p.get("utilities") === "1",
    hasCourtOrder: p.get("order") === "1",
  });

  const finding = headlineFinding(findings);
  const colour = COLOURS[finding.verdict];
  const citation = finding.citations[0];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#1B4332",
          padding: "56px 64px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              background: colour.chip,
              color: "white",
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: 2,
              padding: "8px 18px",
              borderRadius: 6,
            }}
          >
            {colour.label}
          </div>

          <div
            style={{
              display: "flex",
              color: "white",
              fontSize: 52,
              fontWeight: 800,
              lineHeight: 1.18,
              marginTop: 28,
            }}
          >
            {clamp(finding.headline, 130)}
          </div>

          {citation ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                marginTop: 32,
                borderLeft: "6px solid #F59E0B",
                paddingLeft: 22,
              }}
            >
              <div
                style={{
                  display: "flex",
                  color: "rgba(255,255,255,0.85)",
                  fontSize: 26,
                  lineHeight: 1.4,
                }}
              >
                “{clamp(citation.quote, 190)}”
              </div>
              <div
                style={{
                  display: "flex",
                  color: "#F59E0B",
                  fontSize: 22,
                  fontWeight: 700,
                  marginTop: 14,
                }}
              >
                {citation.law}, {citation.section}
              </div>
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid rgba(255,255,255,0.18)",
            paddingTop: 22,
          }}
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 40,
                height: 40,
                borderRadius: 10,
                background: "rgba(255,255,255,0.14)",
                color: "white",
                fontSize: 22,
                fontWeight: 800,
              }}
            >
              R
            </div>
            <div
              style={{
                display: "flex",
                color: "white",
                fontSize: 26,
                fontWeight: 700,
                marginLeft: 14,
              }}
            >
              RentInDex
            </div>
          </div>
          <div style={{ display: "flex", color: "rgba(255,255,255,0.6)", fontSize: 24 }}>
            Check yours · rentindex.com.ng/rights
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        // The answer for a given set of inputs never changes — it is statute.
        "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
      },
    }
  );
}
