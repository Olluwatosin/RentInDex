import { NextRequest, NextResponse } from "next/server";
import { sendEmail, addWaitlistContact } from "@/app/lib/email";
import { dbConfigured, insertWaitlistEmail, markWaitlistSynced } from "@/app/lib/db";

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

    // Store our own copy FIRST, and let a failure here fail the request.
    //
    // This previously wrote only to Brevo/Resend inside a swallowed catch, so
    // when the provider was unconfigured or erroring the address was lost while
    // the user was still told "You're on the list!". Never confirm a signup we
    // did not actually save.
    if (!dbConfigured()) {
      console.error("Waitlist: database not configured — refusing to accept signup.");
      return NextResponse.json(
        { error: "We can't take signups right now. Please try again shortly." },
        { status: 503 }
      );
    }

    let alreadyPresent = false;
    try {
      ({ alreadyPresent } = await insertWaitlistEmail(normalized));
    } catch (err) {
      console.error("Waitlist save failed:", err);
      return NextResponse.json(
        { error: "We couldn't save your email. Please try again in a moment." },
        { status: 500 }
      );
    }

    // Everything past this point is best-effort. The signup is already safe.
    addWaitlistContact(normalized)
      .then((provider) => {
        if (provider) return markWaitlistSynced(normalized, provider);
      })
      .catch(() => {});

    const ownerEmail = process.env.OWNER_EMAIL;
    if (ownerEmail && !alreadyPresent) {
      sendEmail({
        to: ownerEmail,
        subject: `New waitlist signup: ${normalized}`,
        html: `<p><strong>${normalized}</strong> just joined the RentInDex waitlist.</p>`,
      }).catch(() => {});
    }

    if (!alreadyPresent) {
      sendEmail({
        to: normalized,
        subject: "You're on the RentInDex waitlist! 🏠",
        html: `
        <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px">
          <h2 style="color:#1a1a1a">You're in!</h2>
          <p style="color:#444;line-height:1.6">
            Thanks for joining RentInDex — Nigeria's first rent intelligence platform.
            You can already check if any rent is fair using our RentBot assistant, or work
            out what moving in really costs with our move-in cost calculator.
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
    }

    return NextResponse.json(
      {
        message: alreadyPresent
          ? "You're already on the list! Meanwhile, try RentBot to check your rent."
          : "You're on the list! Meanwhile, try RentBot to check your rent now.",
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
