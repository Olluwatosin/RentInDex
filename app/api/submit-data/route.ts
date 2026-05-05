import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { state, area, propertyType, rentRange, totalCostRange, email } = body;

    if (!state || !area || !propertyType || !rentRange) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);

    // Notify owner with structured data
    await resend.emails.send({
      from: "RentInDex <onboarding@resend.dev>",
      to: "salamimuhydeen76@gmail.com",
      subject: `📊 New rent data: ${propertyType} in ${area}, ${state}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:24px;background:#f9f9f9;border-radius:12px">
          <h2 style="color:#1B4332;margin-bottom:16px">New Rent Data Submission</h2>
          <table style="width:100%;border-collapse:collapse">
            <tr style="border-bottom:1px solid #e5e7eb">
              <td style="padding:10px 0;color:#6b7280;font-size:14px;width:40%">State</td>
              <td style="padding:10px 0;font-weight:600;font-size:14px">${state}</td>
            </tr>
            <tr style="border-bottom:1px solid #e5e7eb">
              <td style="padding:10px 0;color:#6b7280;font-size:14px">Area</td>
              <td style="padding:10px 0;font-weight:600;font-size:14px">${area}</td>
            </tr>
            <tr style="border-bottom:1px solid #e5e7eb">
              <td style="padding:10px 0;color:#6b7280;font-size:14px">Property Type</td>
              <td style="padding:10px 0;font-weight:600;font-size:14px">${propertyType}</td>
            </tr>
            <tr style="border-bottom:1px solid #e5e7eb">
              <td style="padding:10px 0;color:#6b7280;font-size:14px">Annual Rent</td>
              <td style="padding:10px 0;font-weight:600;font-size:14px">${rentRange}</td>
            </tr>
            <tr style="border-bottom:1px solid #e5e7eb">
              <td style="padding:10px 0;color:#6b7280;font-size:14px">Total Move-in Cost</td>
              <td style="padding:10px 0;font-weight:600;font-size:14px">${totalCostRange || "Not provided"}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;color:#6b7280;font-size:14px">Email</td>
              <td style="padding:10px 0;font-weight:600;font-size:14px">${email || "Anonymous"}</td>
            </tr>
          </table>
          <p style="color:#9ca3af;font-size:12px;margin-top:16px">Submitted at ${new Date().toISOString()}</p>
        </div>
      `,
    });

    // Confirmation to submitter (best-effort)
    if (email && email.includes("@")) {
      resend.emails.send({
        from: "RentInDex <onboarding@resend.dev>",
        to: email,
        subject: "Thanks for contributing to RentInDex! 🏠",
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px">
            <h2 style="color:#1B4332">Your data is in! Thank you 🙌</h2>
            <p style="color:#444;line-height:1.6">
              You submitted: <strong>${propertyType}</strong> in <strong>${area}, ${state}</strong>
              at <strong>${rentRange}</strong>/year.
            </p>
            <p style="color:#444;line-height:1.6">
              Your response joins 142+ others helping us build Nigeria's first real rent
              intelligence platform. We'll give you free early access when we launch in Abuja.
            </p>
            <p style="color:#888;font-size:13px;margin-top:32px">
              — The RentInDex team · Powered by Smat Concept · <a href="https://rentindex.com.ng">rentindex.com.ng</a>
            </p>
          </div>
        `,
      }).catch(() => {});
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    console.error("Submit data error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
