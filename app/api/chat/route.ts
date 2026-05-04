import { NextRequest, NextResponse } from "next/server";

const SYSTEM_PROMPT = `You are RentBot — the AI assistant for RentInDex, Nigeria's first rent intelligence platform.

You help Nigerian renters understand:
- Fair rent prices by area
- Total move-in cost calculations
- Whether their rent is fair
- What areas fit their budget

Key facts:
- RentInDex is collecting data from renters, launching first in Abuja
- 140+ renters surveyed across 13 states
- Average Nigerian renter pays 40-50% more than advertised rent
- Typical fee structure:
  Agency fee: 5-20% of annual rent
  Caution deposit: 10% of annual rent
  Service charge: 10% of annual rent
  Finder's fee: 5% of annual rent
- Total move-in cost is typically 1.3x to 1.5x the annual rent

Be friendly and conversational. Use Nigerian context naturally (you can use words like "omo", "e don do" sparingly).
Keep responses under 100 words.
Always show prices in Naira (₦).
If asked something outside rent/housing, politely redirect.
If you don't have specific area data yet, say data is still being collected and direct them to join the waitlist at rentindex.com.ng or fill the data form at https://docs.google.com/forms/d/e/1FAIpQLScnKYPOeajElWeapoxLw1ZP7dKEvpqeUb-NwzIw61kKqq0YOQ/viewform`;

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

  if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content as string;
}

function getSuggestions(userText: string, botReply: string): string[] {
  const combined = (userText + " " + botReply).toLowerCase();

  if (combined.includes("move-in") || combined.includes("fees") || combined.includes("cost")) {
    return ["Can I negotiate these fees?", "Which area is most affordable?"];
  }
  if (combined.includes("gwarinpa") || combined.includes("wuse") || combined.includes("maitama") || combined.includes("garki")) {
    return ["What about other Abuja areas?", "Calculate my move-in cost"];
  }
  if (combined.includes("high") || combined.includes("fair") || combined.includes("overcharg")) {
    return ["How do I negotiate my rent?", "What's included in agency fee?"];
  }
  if (combined.includes("budget") || combined.includes("afford") || combined.includes("cheap")) {
    return ["Which areas are in my budget?", "What's the cheapest in Abuja?"];
  }
  if (combined.includes("waitlist") || combined.includes("launch") || combined.includes("when")) {
    return ["What will RentInDex do?", "Calculate my move-in cost"];
  }
  return ["Is my rent too high?", "Calculate my move-in cost"];
}

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

    const fullMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages,
    ];

    const lastUserMessage: string = messages[messages.length - 1]?.content ?? "";

    let reply: string;
    try {
      reply = await callOpenRouter(fullMessages, "openai/gpt-4o-mini");
    } catch {
      reply = await callOpenRouter(fullMessages, "mistralai/mistral-7b-instruct");
    }

    const suggestions = getSuggestions(lastUserMessage, reply);

    return NextResponse.json({ reply, suggestions });
  } catch (err) {
    console.error("Chat API error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
