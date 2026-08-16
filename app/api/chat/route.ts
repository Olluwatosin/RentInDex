import { NextRequest, NextResponse } from "next/server";
import { callLLM } from "@/app/lib/llm";
import { rateLimit } from "@/app/lib/rate-limit";
import { dbConfigured, rentLookup, RentLookup, areasInState, stateForArea } from "@/app/lib/db";
import { detectState } from "@/app/lib/nigeria";
import { parseAmounts, userTurnsOnly, amountCorroborated } from "@/app/lib/amounts";

const SYSTEM_PROMPT = `You are RentBot — the AI assistant for RentInDex, Nigeria's first rent intelligence platform.

Your dual purpose:
1. Help users understand if their rent is fair, using our real data
2. Collect rent data through natural conversation

When a user asks about rent prices or fairness, guide them through these questions naturally — one at a time, never all at once:

Q1: Which state are you in?
Q2: Which area or neighbourhood?
Q3: What type of apartment? (self-con, mini flat, 1-bed, 2-bed, 3-bed, duplex)
Q4: How much do you pay annually? (₦)
Q5: Did you pay any agency or legal fees when you moved in? If yes — roughly how much or what percentage?
Q6: Any caution deposit or service charge?
Q7: Roughly how many hours of electricity do you get a day, and do you know your band (A/B/C)?

CRITICAL RULE ON NUMBERS:
- NEVER invent or guess rent figures, averages, or percentages.
- Only state a specific price when a "LIVE DATA" block is provided below. If it is, base your verdict strictly on those figures.
- If no LIVE DATA block is present, keep gathering details — do not fabricate a verdict.
- We show TWO kinds of price: "asking" (what agents advertise online) and "actually paid" (what real renters told us). Actually-paid is the real market; asking prices run much higher, especially in premium areas.

TONE: Friendly, honest, Nigerian context. Short WhatsApp-style replies. Under 100 words.
Always show prices in Naira (₦).
Never ask more than one question at a time.
If asked something outside rent/housing, politely redirect to rent topics.`;

function getSuggestions(userText: string, botReply: string): string[] {
  const combined = (userText + " " + botReply).toLowerCase();

  if (combined.includes("move-in") || combined.includes("fees") || combined.includes("cost")) {
    return ["What fees should I expect?", "Is my rent fair?"];
  }
  if (combined.includes("area") || combined.includes("abuja") || combined.includes("lagos")) {
    return ["Check if my rent is fair", "Calculate my move-in cost"];
  }
  if (combined.includes("high") || combined.includes("fair") || combined.includes("overcharg")) {
    return ["How do I negotiate rent?", "What fees should I expect?"];
  }
  return ["Is my rent fair?", "Calculate my move-in cost"];
}

const naira = (n: number) => "₦" + Math.round(n).toLocaleString("en-NG");
// Round to a clean figure for display (nearest ₦10k) so medians of ranges don't
// show ugly values like ₦1,250,001.
const nairaClean = (n: number) => naira(Math.round(n / 10000) * 10000);

function bandRange(b: { p25: number; p75: number; p50: number }) {
  // Bucketed data can collapse to a single value — show it cleanly, not "₦X–₦X".
  if (b.p25 === b.p75) return `around ${nairaClean(b.p50)}`;
  return `${nairaClean(b.p25)}–${nairaClean(b.p75)} (typically ${nairaClean(b.p50)})`;
}

// Does the text mention a rent-like amount? Used to decide when the user has
// just supplied their rent, so we deliver the verdict on that turn only.
function mentionsRent(text: string): boolean {
  return /₦\s*[\d,]{3,}|\b\d{5,}\b|\b\d+(?:\.\d+)?\s*(?:k|m|million|thousand|naira)\b/i.test(text);
}

// Deterministically compose the full verdict reply from the engine result.
// The numbers and the fair/high/low call come from code, never the LLM — this
// is money advice, so it must be exact and consistent. Returns null if the
// engine doesn't have enough for a verdict yet.
function composeVerdictReply(d: RentLookup): string | null {
  if (d.user_rent == null || d.verdict === "no_rent" || d.verdict === "insufficient") return null;
  if (!d.asking && !d.actual) return null;

  const ref = d.verdict_basis === "actual" ? d.actual : d.asking;
  if (!ref) return null;

  const type = d.property_type ?? "place";
  const place = d.area ? `${d.area}, ${d.state}` : d.state;
  const rent = naira(d.user_rent);

  let headline: string;
  if (d.verdict_basis === "actual") {
    headline =
      d.verdict === "below"
        ? `✅ Good deal! Your ${rent}/year is *below* what renters typically pay for a ${type} in ${place}.`
        : d.verdict === "fair"
        ? `👍 Looks fair. Your ${rent}/year is right around what renters pay for a ${type} in ${place}.`
        : `⚠️ On the high side. Your ${rent}/year is *above* what renters told us they pay for a ${type} in ${place} — you may have room to negotiate.`;
    headline += ` Most pay ${bandRange(ref)}.`;
  } else {
    headline =
      d.verdict === "below"
        ? `✅ Below market. Your ${rent}/year is *below* typical asking prices for a ${type} in ${place} — looks like a good deal.`
        : d.verdict === "fair"
        ? `👍 Around market. Your ${rent}/year is near typical asking prices for a ${type} in ${place}.`
        : `⚠️ Above asking. Your ${rent}/year is higher than most listings for a ${type} in ${place}.`;
    headline += ` Agents advertise these around ${bandRange(ref)}.`;
  }

  const parts = [headline];

  // The other band, as brief context.
  const other = d.verdict_basis === "actual" ? d.asking : d.actual;
  if (other) {
    // Name the contrast band's geography whenever it differs from the band the
    // verdict rests on — unlabelled, the two figures read as directly
    // comparable when they describe different places.
    const where =
      other.level === ref.level
        ? ""
        : other.level === "area" && d.area
        ? ` in ${d.area}`
        : ` across ${d.state}`;
    parts.push(
      d.verdict_basis === "actual"
        ? `For context, agents advertise similar places${where} around ${bandRange(other)}.`
        : `Renters we've heard from${where} pay around ${bandRange(other)}.`
    );
  }

  // Honest caveat when the reference isn't area-specific or confidence is soft.
  if (ref.level === "state" || d.confidence !== "high") {
    parts.push(
      `⚠️ Heads up: we're still building data for ${d.area ?? "your area"} specifically, so treat this as a ${d.state}-wide estimate for now.`
    );
  }

  // One enrichment question — grows the unique electricity dataset.
  parts.push(
    `One quick thing to help other renters 🙏 — roughly how many hours of electricity do you get a day, and do you know your band (A/B/C)?`
  );

  return parts.join("\n\n");
}

// Is the user asking what rent costs / the average (vs "is MY rent fair")?
function asksAverage(text: string): boolean {
  return /\b(average|typical|going rate|how much|what.?s the (?:rent|price|cost)|price of|cost of|rent for|rents? (?:in|for|like)|market rate|expensive|afford)\b/i.test(
    text
  );
}

// Deterministically answer "what's the average rent for X in Y" from real data.
// If we have the asked AREA, give it. If the user asked about a specific area we
// don't have, be honest, offer areas we DO have, and invite them to contribute.
function composeAverageReply(
  d: RentLookup,
  askedArea: string | null,
  altAreas: string[]
): string | null {
  const type = d.property_type ?? "place";
  const hasAreaData =
    d.actual?.level === "area" || d.asking?.level === "area";

  // Case 1: user asked about a specific area we DON'T have area-level data for.
  if (askedArea && !hasAreaData) {
    const parts: string[] = [
      `📍 I don't have rent data for ${askedArea} specifically yet — I'd rather tell you that than guess.`,
    ];
    const alts = altAreas.filter((a) => a.toLowerCase() !== askedArea.toLowerCase()).slice(0, 5);
    if (alts.length) {
      parts.push(`I do have data for other areas in ${d.state} — like ${alts.join(", ")}. Want the average for any of those?`);
    }
    if (d.actual || d.asking) {
      const b = d.actual ?? d.asking!;
      const lbl = d.actual ? "renters across the state pay" : "listings across the state are advertised at";
      parts.push(`As a rough ${d.state}-wide guide, ${lbl} ${bandRange(b)} a year — but that's not ${askedArea}-specific.`);
    }
    parts.push(
      `👉 You can help fix this: if you rent around ${askedArea}, tell me your apartment type and yearly rent and I'll add it, so the next person gets a real answer. What do you pay?`
    );
    return parts.join("\n\n");
  }

  // Case 2: we have real data — give it, labelling each band by its true
  // geography (never present state-wide numbers as if they were area-specific).
  const band = d.actual ?? d.asking;
  if (!band) return null;
  const scope = (lvl: string) =>
    lvl === "area" && d.area ? `in ${d.area}` : `across ${d.state}${d.area ? " (state-wide — not " + d.area + "-specific yet)" : ""}`;
  const parts: string[] = [`💰 Here's what I have for a ${type}:`];
  if (d.actual) parts.push(`Renters ${scope(d.actual.level)} told us they typically pay ${bandRange(d.actual)} a year.`);
  if (d.asking) parts.push(`Agents advertise them ${scope(d.asking.level)} around ${bandRange(d.asking)}.`);

  // "Asking runs higher than paid" is only an honest read when both bands
  // describe the SAME place. Setting an area's listings against a state-wide
  // renter average measures geography, not landlord markup — that's how a
  // premium area like Gwarinpa gets reported as a huge overcharge.
  if (d.actual && d.asking) {
    if (d.actual.level === d.asking.level) {
      if (d.asking.p50 > d.actual.p50) {
        parts.push(`Asking prices here run higher than what people actually pay — useful leverage when you negotiate.`);
      }
    } else {
      const areaLabel = d.area ?? "that area";
      const areaIsRenters = d.actual.level === "area";
      const narrow = areaIsRenters ? "renter" : "listing";
      const wide = areaIsRenters ? "listing" : "renter";
      parts.push(
        `⚠️ Don't read a markup into those two — the ${narrow} figure is ${areaLabel}-specific while the ${wide} figure is ${d.state}-wide, so most of that gap is geography, not landlords. I need more ${wide} data for ${areaLabel} before I can tell you the real difference.`
      );
    }
  }

  // When the crowd figure isn't area-specific, the most useful thing the user
  // can do is close that exact gap.
  if (d.area && d.actual && d.actual.level !== "area") {
    parts.push(
      `👉 Renting around ${d.area}? Tell me your apartment type and yearly rent and I'll add it — that's how ${d.area} gets a real number of its own. Or give me any rent and I'll check if it's fair.`
    );
  } else {
    parts.push(`Want me to check if a specific rent is fair, or add your own? Just tell me the yearly amount 🙂`);
  }
  return parts.join("\n\n");
}

// When we don't yet have enough for a verdict, give the LLM the real figures
// as context so it can keep the conversation grounded while gathering details.
function buildGatheringHint(d: RentLookup): string | null {
  if (!d.asking && !d.actual) return null;
  const lines = [`CONTEXT — real data for ${d.property_type ?? "property"} in ${d.area ?? d.state}, ${d.state} (use ONLY these figures, never invent):`];
  if (d.actual) lines.push(`- What renters pay: ${bandRange(d.actual)} (${d.actual.level}-level)`);
  if (d.asking) lines.push(`- Asking prices online: ${bandRange(d.asking)} (${d.asking.level}-level)`);

  // Tell the model exactly what's already known so it never re-asks for it.
  const known: string[] = [`state=${d.state}`];
  if (d.area) known.push(`area=${d.area}`);
  if (d.property_type) known.push(`apartment type=${d.property_type}`);
  const missing: string[] = [];
  if (!d.area) missing.push("area/neighbourhood");
  if (!d.property_type) missing.push("apartment type");
  if (d.user_rent == null) missing.push("yearly rent in ₦");

  lines.push(`Already known (do NOT ask for these again): ${known.join(", ")}.`);
  lines.push(
    missing.length
      ? `Ask ONLY for the still-missing detail(s), one at a time: ${missing.join(", ")}.`
      : `You have everything — no more questions needed.`
  );
  return lines.join("\n");
}

// Extract the fields the answer engine needs from the conversation so far.
async function extractLookupFields(conversation: string): Promise<{
  area: string | null;
  property_type: string | null;
  annual_rent: number | null;
} | null> {
  const prompt = `From this conversation, extract the renter's details. Return ONLY JSON:
{"area": string or null, "property_type": string or null, "annual_rent": number or null}
Rules: area = neighbourhood/area name only (not the state). property_type e.g. "2 bedroom flat", "Self contained", "Mini flat". annual_rent = yearly rent in naira as a number (convert "1.2m"=1200000, "800k"=800000).

Conversation:
${conversation}`;
  try {
    const raw = await callLLM(
      [{ role: "user", content: prompt }],
      "You extract structured data. Return only valid JSON, no markdown.",
      150
    );
    const m = raw.replace(/```json\s*/gi, "").replace(/```/g, "").match(/\{[\s\S]*\}/);
    if (!m) return null;
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(ip, 20, 60_000)) {
    return NextResponse.json({ error: "Too many messages. Please wait a moment." }, { status: 429 });
  }

  try {
    const body = await req.json();
    const { messages } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "Invalid messages format." }, { status: 400 });
    }

    const MAX_MESSAGES = 40;
    const trimmed = messages.slice(-MAX_MESSAGES);

    for (const msg of trimmed) {
      if (
        typeof msg !== "object" ||
        !msg ||
        typeof msg.role !== "string" ||
        typeof msg.content !== "string" ||
        !["user", "assistant"].includes(msg.role)
      ) {
        return NextResponse.json({ error: "Invalid message format." }, { status: 400 });
      }
    }

    const lastUserMessage: string = trimmed[trimmed.length - 1]?.content ?? "";

    let systemPrompt = SYSTEM_PROMPT;
    const conversationText = trimmed
      .map((m: { role: string; content: string }) => `${m.role}: ${m.content}`)
      .join("\n");

    // Consult the answer engine when the message looks rent-related.
    const rentIntent =
      asksAverage(lastUserMessage) || mentionsRent(lastUserMessage) || Boolean(detectState(conversationText));

    if (rentIntent && dbConfigured()) {
      const fields = await extractLookupFields(conversationText);
      const askedArea = fields?.area ?? null;
      // The transcript we hand the extractor contains our own quoted medians, so
      // the model can hand back one of them as "the user's rent" and we'd issue a
      // verdict on a figure nobody gave us. Only honour a rent the user typed.
      const statedAmounts = parseAmounts(userTurnsOnly(conversationText));
      const userRent =
        typeof fields?.annual_rent === "number" &&
        fields.annual_rent > 0 &&
        amountCorroborated(fields.annual_rent, statedAmounts)
          ? fields.annual_rent
          : null;
      // State may be named directly, or inferred from the area (e.g. "Gwarinpa" → Abuja).
      let state = detectState(conversationText);
      if (!state && askedArea) state = await stateForArea(askedArea);

      if (state) {
        const lookup = await rentLookup({
          state,
          area: askedArea,
          propertyType: fields?.property_type ?? null,
          annualRent: userRent,
        });
        if (lookup) {
          // 1) User gave their rent → deterministic fairness verdict.
          if (mentionsRent(lastUserMessage)) {
            const verdictReply = composeVerdictReply(lookup);
            if (verdictReply) {
              return NextResponse.json({
                reply: verdictReply,
                suggestions: ["What fees should I expect?", "How do I negotiate rent?"],
              });
            }
          }
          // 2) User asking the average → answer directly; if we lack their exact
          //    area, be honest and offer areas we do have + invite contribution.
          if (asksAverage(lastUserMessage)) {
            const hasAreaData = lookup.actual?.level === "area" || lookup.asking?.level === "area";
            const altAreas = askedArea && !hasAreaData ? await areasInState(state) : [];
            const avgReply = composeAverageReply(lookup, askedArea, altAreas);
            if (avgReply) {
              return NextResponse.json({
                reply: avgReply,
                suggestions: ["Is my rent fair?", "Add my rent data"],
              });
            }
          }
          // 3) Otherwise ground the LLM with real figures while gathering details.
          const hint = buildGatheringHint(lookup);
          if (hint) systemPrompt = `${SYSTEM_PROMPT}\n\n${hint}`;
        }
      }
    }

    const reply = await callLLM(trimmed, systemPrompt, 200);

    const suggestions = getSuggestions(lastUserMessage, reply);
    return NextResponse.json({ reply, suggestions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Chat API error:", message);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
