import { NextRequest, NextResponse } from "next/server";
import { callLLM } from "@/app/lib/llm";
import { rateLimit } from "@/app/lib/rate-limit";
import { dbConfigured, rentLookup, RentLookup } from "@/app/lib/db";
import { detectState } from "@/app/lib/nigeria";

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

function bandRange(b: { p25: number; p75: number; p50: number }) {
  // Bucketed data can collapse to a single value — show it cleanly, not "₦X–₦X".
  if (b.p25 === b.p75) return `around ${naira(b.p50)}`;
  return `${naira(b.p25)}–${naira(b.p75)} (typically ${naira(b.p50)})`;
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
    parts.push(
      d.verdict_basis === "actual"
        ? `For context, agents advertise similar places around ${bandRange(other)}.`
        : `Renters we've heard from pay around ${bandRange(other)}.`
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

    // If the conversation names a Nigerian state, consult the answer engine.
    let systemPrompt = SYSTEM_PROMPT;
    const conversationText = trimmed
      .map((m: { role: string; content: string }) => `${m.role}: ${m.content}`)
      .join("\n");
    const state = detectState(conversationText);
    if (state && dbConfigured()) {
      const fields = await extractLookupFields(conversationText);
      const lookup = await rentLookup({
        state,
        area: fields?.area ?? null,
        propertyType: fields?.property_type ?? null,
        annualRent: fields?.annual_rent ?? null,
      });
      if (lookup) {
        // Deliver the verdict deterministically on the turn the user supplies
        // their rent — exact numbers, no LLM in the money-advice path.
        if (mentionsRent(lastUserMessage)) {
          const verdictReply = composeVerdictReply(lookup);
          if (verdictReply) {
            return NextResponse.json({
              reply: verdictReply,
              suggestions: ["What fees should I expect?", "How do I negotiate rent?"],
            });
          }
        }
        // Otherwise ground the LLM with the real figures while it gathers details.
        const hint = buildGatheringHint(lookup);
        if (hint) systemPrompt = `${SYSTEM_PROMPT}\n\n${hint}`;
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
