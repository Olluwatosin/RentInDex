import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  try {
    const body = await req.json();
    const { email } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    const ownerEmail = process.env.OWNER_EMAIL;
    if (!ownerEmail) {
      console.error("OWNER_EMAIL env var not set");
      return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });
    }

    const normalized = email.trim().toLowerCase();

    if (process.env.RESEND_AUDIENCE_ID) {
      resend.contacts.create({
        audienceId: process.env.RESEND_AUDIENCE_ID,
        email: normalized,
        unsubscribed: false,
      }).catch(() => {});
    }

    await resend.emails.send({
      from: "RentInDex <onboarding@resend.dev>",
      to: ownerEmail,
      subject: `New waitlist signup: ${normalized}`,
      html: `<p><strong>${normalized}</strong> just joined the RentInDex waitlist.</p>`,
    });

    resend.emails.send({
      from: "RentInDex <onboarding@resend.dev>",
      to: normalized,
      subject: "You're on the RentInDex waitlist!",
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px">
          <h2 style="color:#1a1a1a">You're in!</h2>
          <p style="color:#444;line-height:1.6">
            Thanks for joining the RentInDex waitlist. We're building Nigeria's first
            rent intelligence platform — starting in Abuja — so you never get
            overcharged on rent again.
          </p>
          <p style="color:#444;line-height:1.6">
            We'll send you an early-access invite the moment we launch.
          </p>
          <p style="color:#888;font-size:13px;margin-top:32px">
            — The RentInDex team · Powered by Smat Concept
          </p>
        </div>
      `,
    }).catch(() => {});

    return NextResponse.json(
      {
        message:
          "You're on the list! We'll notify you first when we launch in Abuja.",
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("Waitlist API error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ count: null }, { status: 200 });
}
