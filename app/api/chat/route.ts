import { NextRequest, NextResponse } from "next/server";

const GOOGLE_FORM = "https://docs.google.com/forms/d/e/1FAIpQLScnKYPOeajElWeapoxLw1ZP7dKEvpqeUb-NwzIw61kKqq0YOQ/viewform";

const SYSTEM_PROMPT = `You are RentBot — the friendly AI assistant for RentInDex, Nigeria's first rent intelligence platform.

IMPORTANT — CURRENT PHASE:
RentInDex is in the DATA GATHERING PHASE. We are actively collecting real rent data from Nigerian renters right now. We do not yet have enough data to give precise rent prices for specific areas. Be fully transparent about this. Do NOT make up specific rent figures.

YOUR PRIMARY MISSION RIGHT NOW:
Encourage every user to fill our data form. This is the most important thing you can do. The more data we collect, the better we can answer rent questions for everyone.
Data form: ${GOOGLE_FORM}

HOW TO HANDLE QUESTIONS:
- If someone asks about rent prices in a specific area (e.g. "what's rent in Lekki?"):
  → Acknowledge the question warmly, explain we're still gathering data for that area, give general fee knowledge (agency 5-20%, caution 10%, service charge 10%), then enthusiastically ask them to fill the form so WE CAN answer their exact question soon.

- If someone asks to calculate move-in cost:
  → You CAN help with this! Formula: annual rent × 1.3 to 1.5 covers typical fees. Ask them for their rent amount, calculate it, then invite them to share their actual rent data via the form.

- If someone asks if their rent is fair:
  → Tell them we're building exactly this feature. We can't say yet for their specific area, but their data helps us build it. Direct them to the form.

- For ANY question you can't fully answer:
  → Be honest, warm, and enthusiastic about the data gathering mission. Never say "I don't know" bluntly — say "we're gathering that data right now and YOUR response helps!"

KEY FACTS YOU KNOW:
- 142+ renters already surveyed across 15 states
- Average Nigerian renter pays 40-50% more than advertised rent due to hidden fees
- Agency fee: 5-20% | Caution: 10% | Service charge: 10% | Finder's fee: 5%
- Most common rent range: ₦300k–₦600k/year
- 82% of renters paid agency fees, 70% also paid finder's fee

TONE: Friendly, honest, Nigerian context. Short WhatsApp-style replies. Under 100 words.
Always show prices in Naira (₦).
If asked something outside rent/housing, politely redirect to rent topics.`;

async function callOpenRouter(
  messages: Array<{ role: string; content: string }>,
  model: string
): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "HTTP-Referer": "https://rentindex.com.ng",
      "X-Title": "RentInDex",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 200,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${body}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty response from model");
  return content as string;
}

function getSuggestions(userText: string, botReply: string): string[] {
  const combined = (userText + " " + botReply).toLowerCase();

  if (combined.includes("move-in") || combined.includes("fees") || combined.includes("cost")) {
    return ["Share my rent data 📊", "Can I negotiate these fees?"];
  }
  if (combined.includes("area") || combined.includes("abuja") || combined.includes("lagos") || combined.includes("gwarinpa")) {
    return ["Share my rent data 📊", "Calculate my move-in cost"];
  }
  if (combined.includes("high") || combined.includes("fair") || combined.includes("overcharg")) {
    return ["Share my rent data 📊", "How do I negotiate rent?"];
  }
  if (combined.includes("budget") || combined.includes("afford")) {
    return ["Share my rent data 📊", "What fees should I expect?"];
  }
  return ["Share my rent data 📊", "Calculate my move-in cost"];
}

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error("OPENROUTER_API_KEY is not set");
    return NextResponse.json(
      { error: "API key not configured. Please contact support." },
      { status: 500 }
    );
  }

  try {
    const { messages } = await req.json();

    const fullMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages,
    ];

    const lastUserMessage: string = messages[messages.length - 1]?.content ?? "";

    let reply: string;
    let lastError: unknown;

    for (const model of ["openai/gpt-4o-mini", "mistralai/mistral-7b-instruct"]) {
      try {
        reply = await callOpenRouter(fullMessages, model);
        break;
      } catch (err) {
        console.error(`Model ${model} failed:`, err);
        lastError = err;
      }
    }

    if (!reply!) {
      throw lastError ?? new Error("All models failed");
    }

    const suggestions = getSuggestions(lastUserMessage, reply!);
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
