import { NextRequest, NextResponse } from "next/server";
import { callLLM } from "@/app/lib/llm";

const SYSTEM_PROMPT = `You are RentBot — the AI assistant for RentInDex, Nigeria's first rent intelligence platform.

Your dual purpose:
1. Help users understand if their rent is fair based on our collected data
2. Collect rent data through natural conversation

When a user asks about rent prices or fairness, guide them through these questions naturally — one at a time, never all at once:

Q1: Which state are you in?
Q2: Which area or neighbourhood?
Q3: What type of apartment? (self-con, mini flat, 1-bed, 2-bed, 3-bed, duplex)
Q4: How much do you pay annually? (₦)
Q5: Did you pay any agency or legal fees when you moved in? If yes — roughly how much or what percentage?
Q6: Any caution deposit or service charge?

After collecting answers, give a clear verdict:
- FAIR (within average for their area)
- ABOVE AVERAGE (with % above)
- BELOW AVERAGE (good deal — with %)
- INSUFFICIENT DATA (if area is unknown to us yet)

KEY FACTS YOU KNOW:
- Average Nigerian renter pays 40-50% more than advertised rent due to hidden fees
- Agency fee: 5-20% | Caution: 10% | Service charge: 10% | Finder's fee: 5%
- Most common rent range: ₦300k–₦600k/year
- 82% of renters paid agency fees, 73% also paid finder's fee

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

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();
    const lastUserMessage: string = messages[messages.length - 1]?.content ?? "";

    const reply = await callLLM(messages, SYSTEM_PROMPT, 200);

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
