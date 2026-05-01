import { NextRequest, NextResponse } from "next/server";
import { addEmail, getCount } from "@/app/lib/db";

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

    const result = await addEmail(email.trim());

    if (result.alreadyExists) {
      return NextResponse.json(
        { message: "You're already on the waitlist! We'll be in touch soon." },
        { status: 200 }
      );
    }

    const count = await getCount();

    return NextResponse.json(
      {
        message: `You're on the list! You're #${count} on the RentInDex waitlist. We'll notify you first when we launch in Abuja.`,
        count,
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
  try {
    const count = await getCount();
    return NextResponse.json({ count }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Could not fetch count." }, { status: 500 });
  }
}
