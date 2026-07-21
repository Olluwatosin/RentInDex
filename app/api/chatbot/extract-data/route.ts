import { NextRequest, NextResponse } from "next/server";
import { callLLM } from "@/app/lib/llm";
import { writeToSheet, ChatbotRentData } from "@/app/lib/sheets";
import { dbConfigured, insertRenterRow } from "@/app/lib/db";
import { Resend } from "resend";
import { rateLimit } from "@/app/lib/rate-limit";

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
  if (!rateLimit(ip, 10, 60_000)) {
    return NextResponse.json({ saved: false, reason: "rate_limited" }, { status: 429 });
  }

  try {
    const body = await req.json();
    const { conversation, conversationId } = body;

    if (!conversation || typeof conversation !== "string") {
      return NextResponse.json({ saved: false, reason: "invalid_input" }, { status: 400 });
    }

    const convId: string | null =
      typeof conversationId === "string" && conversationId.length <= 64 ? conversationId : null;

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

    const raw = await callLLM(
      [{ role: "user", content: extractionPrompt }],
      EXTRACTION_SYSTEM_PROMPT,
      300
    );

    const data = parseExtracted(raw);

    if (!data) {
      return NextResponse.json({ saved: false, reason: "parse_error" });
    }

    if (data.confidence !== "high" && data.confidence !== "medium") {
      return NextResponse.json({ saved: false, reason: "low_confidence" });
    }

    // Primary store: Supabase. The Google Sheet is kept as a dual-write
    // backup during the migration period.
    let stored = false;
    if (dbConfigured() && data.state) {
      try {
        await insertRenterRow({
          source: "chatbot",
          conversation_id: convId, // upsert: one conversation = one row
          state: data.state,
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

    if (process.env.RESEND_API_KEY && process.env.OWNER_EMAIL) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      resend.emails.send({
        from: "RentInDex <onboarding@resend.dev>",
        to: process.env.OWNER_EMAIL,
        subject: `📊 Chatbot rent data: ${data.property_type ?? "?"} in ${data.area ?? "?"}, ${data.state ?? "?"}`,
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:24px;background:#f9f9f9;border-radius:12px">
            <h2 style="color:#1B4332">New Chatbot Rent Data</h2>
            <p style="color:#666;font-size:13px">Confidence: <strong>${data.confidence}</strong> · Source: chatbot</p>
            <table style="width:100%;border-collapse:collapse;margin-top:12px">
              ${[
                ["State", data.state],
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
