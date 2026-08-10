import { NextRequest, NextResponse } from "next/server";
import { sendEmail, addWaitlistContact } from "@/app/lib/email";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
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

    const normalized = email.trim().toLowerCase();

    // Save the contact (the important part) first — never let a missing owner
    // email or a notification failure break the user's signup.
    addWaitlistContact(normalized).catch(() => {});

    const ownerEmail = process.env.OWNER_EMAIL;
    if (ownerEmail) {
      sendEmail({
        to: ownerEmail,
        subject: `New waitlist signup: ${normalized}`,
        html: `<p><strong>${normalized}</strong> just joined the RentInDex waitlist.</p>`,
      }).catch(() => {});
    }

    sendEmail({
      to: normalized,
      subject: "You're on the RentInDex waitlist! 🏠",
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px">
          <h2 style="color:#1a1a1a">You're in!</h2>
          <p style="color:#444;line-height:1.6">
            Thanks for joining RentInDex — Nigeria's first rent intelligence platform.
            You can already check if any rent is fair using our RentBot assistant on the site.
          </p>
          <p style="color:#444;line-height:1.6">
            We'll keep you posted as we add more tools and cover more areas.
          </p>
          <p style="color:#888;font-size:13px;margin-top:32px">
            — The RentInDex team · founder@rentindex.com.ng
          </p>
        </div>
      `,
    }).catch(() => {});

    return NextResponse.json(
      { message: "You're on the list! Meanwhile, try RentBot to check your rent now." },
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
