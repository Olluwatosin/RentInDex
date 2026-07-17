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

function bandLine(label: string, b: { level: string; p25: number; p50: number; p75: number; n: number }) {
  const scope = b.level === "area" ? "this area" : "state-wide (no area-specific data yet)";
  return `${label}: typically ${naira(b.p50)} (most pay ${naira(b.p25)}–${naira(b.p75)}), from ${b.n} data points, ${scope}`;
}

// Turn a rent_lookup result into a factual block the model must ground its answer in.
function buildLiveData(d: RentLookup): string | null {
  if (!d.asking && !d.actual) return null;
  const lines: string[] = [
    `LIVE DATA for ${d.property_type ?? "property"} in ${d.area ?? d.state}, ${d.state}:`,
  ];
  if (d.actual) lines.push("- " + bandLine("Actually paid by real renters", d.actual));
  if (d.asking) lines.push("- " + bandLine("Advertised asking prices online", d.asking));
  if (d.user_rent && d.verdict !== "no_rent" && d.verdict !== "insufficient") {
    const basis = d.verdict_basis === "actual" ? "what renters actually pay" : "advertised asking prices";
    const call =
      d.verdict === "below" ? "BELOW the going rate — a good deal"
      : d.verdict === "fair" ? "FAIR — within the normal range"
      : "ABOVE the going rate — they may be overpaying";
    lines.push(
      `- The user pays ${naira(d.user_rent)}. Versus ${basis}, this is ${call}. (confidence: ${d.confidence})`
    );
  }
  lines.push(
    "Use ONLY these figures. If confidence is low or the data is state-wide, say so honestly and invite the user to help by sharing their own rent."
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

    // If the conversation names a Nigerian state, pull real numbers from the
    // answer engine and hand them to the model as ground truth.
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
      const liveData = lookup ? buildLiveData(lookup) : null;
      if (liveData) systemPrompt = `${SYSTEM_PROMPT}\n\n${liveData}`;
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
