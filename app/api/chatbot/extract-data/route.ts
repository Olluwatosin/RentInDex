import { NextRequest, NextResponse } from "next/server";
import { callLLM } from "@/app/lib/llm";
import { writeToSheet, ChatbotRentData } from "@/app/lib/sheets";
import { Resend } from "resend";

export const dynamic = "force-dynamic";

const EXTRACTION_SYSTEM_PROMPT =
  "You are a data extraction assistant. Return only valid JSON with no markdown, no code fences, no explanation.";

function parseExtracted(raw: string): ChatbotRentData | null {
  // Strip markdown code fences if the LLM added them
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Try to find the first { ... } block
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
  try {
    const { conversation } = await req.json();

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
  "confidence": "high" or "medium" or "low"
}

Rules:
- Convert ranges to midpoint (e.g. "800k to 1m" = 900000)
- Convert percentages to amounts if rent is known
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

    // Write to Google Sheet (primary — increments the live counter)
    await writeToSheet(data);

    // Email backup to owner
    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      resend.emails.send({
        from: "RentInDex <onboarding@resend.dev>",
        to: "salamimuhydeen76@gmail.com",
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
