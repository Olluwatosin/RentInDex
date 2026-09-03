import { NextRequest, NextResponse } from "next/server";
import { callLLM, LLMUnavailableError } from "@/app/lib/llm";
import { writeToSheet, ChatbotRentData } from "@/app/lib/sheets";
import { dbConfigured, insertRenterRow, getChatSession } from "@/app/lib/db";
import { sendEmail } from "@/app/lib/email";
import { rateLimit, ipBucket } from "@/app/lib/rate-limit";
import { detectState } from "@/app/lib/nigeria";
import {
  parseAmounts,
  userTurnsOnly,
  amountCorroborated,
  mentionsPercentage,
} from "@/app/lib/amounts";

export const dynamic = "force-dynamic";

const EXTRACTION_SYSTEM_PROMPT =
  "You are a data extraction assistant. Return only valid JSON with no markdown, no code fences, no explanation.";

function parseExtracted(raw: string): ChatbotRentData | null {
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!(await rateLimit(ipBucket("extract", ip), 10, 60_000))) {
    return NextResponse.json({ saved: false, reason: "rate_limited" }, { status: 429 });
  }

  try {
    const body = await req.json();
    const sessionId: unknown = body?.sessionId;

    if (typeof sessionId !== "string" || !/^[0-9a-f-]{36}$/i.test(sessionId)) {
      return NextResponse.json({ saved: false, reason: "invalid_input" }, { status: 400 });
    }

    // The transcript comes from our own store, never from the request.
    //
    // This endpoint used to accept the conversation as a body field, and the
    // corroboration guard below then checked the model's output against that
    // same caller-supplied text — which makes it airtight against RentBot
    // quoting itself and completely useless against someone writing their own
    // "User: I pay ₦9,000,000" and running it in a loop. Reading the server's
    // copy means a renter row can only come from a conversation that happened.
    const session = await getChatSession(sessionId);
    if (!session) {
      return NextResponse.json({ saved: false, reason: "unknown_session" }, { status: 404 });
    }

    const conversation = session.messages
      .map((m) => `${m.role === "user" ? "User" : "Bot"}: ${m.content}`)
      .join("\n");

    // One session is one row: the session id is ours, so it can't be used to
    // target or overwrite another conversation's row.
    const convId: string = sessionId;

    const extractionPrompt = `Extract rental data from this conversation. Return ONLY valid JSON, nothing else:
{
  "state": string or null,
  "city": string or null,
  "area": string or null,
  "property_type": string or null,
  "annual_rent": number or null,
  "agency_fee": number or null,
  "caution_deposit": number or null,
  "service_charge": number or null,
  "finder_fee": number or null,
  "power_hours": number or null,
  "power_band": "A" | "B" | "C" | "D" | "E" or null,
  "power_metering": "prepaid" | "estimated" | "shared" or null,
  "confidence": "high" or "medium" or "low"
}

Rules:
- ONLY extract figures the User stated about their OWN home. The Bot lines quote
  market averages and listing prices — those are NEVER the user's rent or fees.
  If the User never gave a figure for a field, return null for it.
- Convert ranges to midpoint (e.g. "800k to 1m" = 900000)
- Convert percentages to amounts if rent is known
- power_hours = approximate hours of electricity per day as a number 0–24 (e.g. "about 10 hours"=10, "6 to 12"=9, "18+"=18, "half a day"=12)
- power_band = the DisCo tariff band letter only, if the user states it; else null
- power_metering = prepaid/estimated/shared only if mentioned; else null
- confidence = "high" if state + area + rent all present
- confidence = "medium" if at least state + rent present
- confidence = "low" if missing key fields

Conversation:
${conversation}`;

    // A provider outage must report itself as an outage. It used to arrive here
    // as callLLM's "I'm having trouble connecting" sentence, which parsed as
    // nothing and was filed under `parse_error` — so RentBot silently collected
    // zero rows for weeks while the reason looked like a JSON quirk.
    let raw: string;
    try {
      raw = await callLLM(
        [{ role: "user", content: extractionPrompt }],
        EXTRACTION_SYSTEM_PROMPT,
        // Generous budget on purpose: the model serving us may be a reasoning
        // model (gpt-oss), which spends tokens thinking before it emits a
        // single character of JSON. At 300 the object was being cut off
        // mid-field and reported as a parse error.
        1200,
        { json: true, temperature: 0 }
      );
    } catch (err) {
      if (err instanceof LLMUnavailableError) {
        console.error("Extraction: all LLM providers unavailable:", err.message);
        return NextResponse.json({ saved: false, reason: "llm_unavailable" });
      }
      throw err;
    }

    const data = parseExtracted(raw);

    if (!data) {
      console.warn("Extraction: model output did not parse:", raw.slice(0, 200));
      return NextResponse.json({ saved: false, reason: "parse_error" });
    }

    // Hard guard: a rent record is only meaningful with a state AND an actual
    // rent figure. Never save (or claim we saved) a near-empty row — this is
    // what caused "your data was saved" with no rent behind it.
    const hasRealRent = typeof data.annual_rent === "number" && data.annual_rent > 0;
    if (!data.state || !hasRealRent) {
      return NextResponse.json({ saved: false, reason: "need_state_and_rent" });
    }

    // Plausibility bound. Requiring a real session raises the cost of poisoning
    // the index enormously, but it doesn't make a single row true: a genuine
    // conversation can still carry a typo or a deliberate ₦900,000,000. These
    // bounds are wide enough to admit the cheapest room in the country and the
    // most expensive flat in Ikoyi, and narrow enough to keep a stray figure
    // out of a published median.
    const MIN_PLAUSIBLE_RENT = 20_000;
    const MAX_PLAUSIBLE_RENT = 200_000_000;
    if (
      data.annual_rent! < MIN_PLAUSIBLE_RENT ||
      data.annual_rent! > MAX_PLAUSIBLE_RENT
    ) {
      console.warn(`Extraction: implausible rent rejected (${data.annual_rent})`);
      return NextResponse.json({ saved: false, reason: "implausible_rent" });
    }

    const userText = userTurnsOnly(conversation);

    // rent_lookup matches on an exact state string, and the rest of the app
    // canonicalises to names like "FCT Abuja". The model hands back whatever the
    // user typed ("Abuja"), so an uncanonicalised row is invisible to every
    // lookup — it silently never joins the index it was collected for.
    const canonicalState = detectState(data.state) ?? detectState(userText);
    if (!canonicalState) {
      return NextResponse.json({ saved: false, reason: "state_not_recognised" });
    }

    // The transcript includes RentBot's own replies, and those quote market
    // medians ("renters typically pay ₦1,250,000"). Without this check the model
    // reports one of OUR figures as the user's rent — saving a fabricated renter
    // row and feeding our published averages back into our own dataset. A rent
    // only counts if the USER actually typed it.
    const statedAmounts = parseAmounts(userText);
    if (!amountCorroborated(data.annual_rent!, statedAmounts)) {
      return NextResponse.json({ saved: false, reason: "rent_not_stated_by_user" });
    }

    // Same contamination risk for the fee fields. Drop any the user didn't
    // state — unless they gave a percentage, which the model converts to an
    // amount that legitimately won't appear verbatim in their text.
    if (!mentionsPercentage(userText)) {
      const feeFields = ["agency_fee", "caution_deposit", "service_charge", "finder_fee"] as const;
      for (const field of feeFields) {
        const value = data[field];
        if (typeof value === "number" && value > 0 && !amountCorroborated(value, statedAmounts)) {
          data[field] = null;
        }
      }
    }

    // Primary store: Supabase. The Google Sheet is kept as a dual-write
    // backup during the migration period.
    let stored = false;
    if (dbConfigured()) {
      try {
        await insertRenterRow({
          source: "chatbot",
          conversation_id: convId, // upsert: one conversation = one row
          state: canonicalState,
          city: data.city,
          area_raw: data.area,
          property_type: data.property_type,
          annual_rent: data.annual_rent,
          agency_fee: data.agency_fee,
          caution_deposit: data.caution_deposit,
          service_charge: data.service_charge,
          finder_fee: data.finder_fee,
          power_hours: data.power_hours,
          power_band: data.power_band,
          power_metering: data.power_metering,
          confidence: data.confidence,
        });
        stored = true;
      } catch (dbErr) {
        console.error("Supabase insert failed for chatbot data:", dbErr);
      }
    }

    // Sheet is now a FALLBACK only (Supabase is the source of truth). Dual-writing
    // would append a duplicate row on every re-extraction of the same conversation.
    if (!stored) {
      try {
        await writeToSheet(data);
        stored = true;
      } catch (sheetErr) {
        console.error("Sheet fallback write failed for chatbot data:", sheetErr);
        throw sheetErr; // both stores failed — surface the error
      }
    }

    if (process.env.OWNER_EMAIL) {
      sendEmail({
        to: process.env.OWNER_EMAIL,
        subject: `📊 Chatbot rent data: ${data.property_type ?? "?"} in ${data.area ?? "?"}, ${canonicalState}`,
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:24px;background:#f9f9f9;border-radius:12px">
            <h2 style="color:#1B4332">New Chatbot Rent Data</h2>
            <p style="color:#666;font-size:13px">Confidence: <strong>${data.confidence}</strong> · Source: chatbot</p>
            <table style="width:100%;border-collapse:collapse;margin-top:12px">
              ${[
                ["State", canonicalState],
                ["City", data.city],
                ["Area", data.area],
                ["Property Type", data.property_type],
                ["Annual Rent", data.annual_rent ? `₦${data.annual_rent.toLocaleString()}` : null],
                ["Agency Fee", data.agency_fee ? `₦${data.agency_fee.toLocaleString()}` : null],
                ["Caution Deposit", data.caution_deposit ? `₦${data.caution_deposit.toLocaleString()}` : null],
                ["Service Charge", data.service_charge ? `₦${data.service_charge.toLocaleString()}` : null],
                ["Finder Fee", data.finder_fee ? `₦${data.finder_fee.toLocaleString()}` : null],
              ]
                .filter(([, v]) => v)
                .map(
                  ([k, v]) =>
                    `<tr style="border-bottom:1px solid #e5e7eb">
                      <td style="padding:8px 0;color:#6b7280;font-size:13px;width:40%">${k}</td>
                      <td style="padding:8px 0;font-weight:600;font-size:13px">${v}</td>
                    </tr>`
                )
                .join("")}
            </table>
            <p style="color:#9ca3af;font-size:12px;margin-top:16px">Submitted at ${new Date().toISOString()}</p>
          </div>`,
      }).catch(() => {});
    }

    return NextResponse.json({ saved: true, confidence: data.confidence });
  } catch (err) {
    console.error("Extract data error:", err);
    return NextResponse.json({ saved: false, reason: "server_error" });
  }
}
