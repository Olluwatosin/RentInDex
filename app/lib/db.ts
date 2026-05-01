import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const AUDIENCE_ID = process.env.RESEND_AUDIENCE_ID!;

export async function addEmail(
  email: string
): Promise<{ success: boolean; alreadyExists: boolean }> {
  const normalized = email.toLowerCase().trim();

  // Check for existing contact first
  const { data: list } = await resend.contacts.list({ audienceId: AUDIENCE_ID });
  const contacts = (list as any)?.data ?? [];
  const exists = contacts.some(
    (c: { email: string }) => c.email.toLowerCase() === normalized
  );
  if (exists) return { success: false, alreadyExists: true };

  const { error } = await resend.contacts.create({
    audienceId: AUDIENCE_ID,
    email: normalized,
    unsubscribed: false,
  });

  if (error) throw new Error((error as any).message ?? "Resend error");

  // Send welcome email
  await resend.emails.send({
    from: "RentInDex <hello@rentindex.com.ng>",
    to: normalized,
    subject: "You're on the RentInDex waitlist!",
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px">
        <h2 style="color:#1a1a1a">You're in. 🎉</h2>
        <p style="color:#444;line-height:1.6">
          Thanks for joining the RentInDex waitlist. We're building Nigeria's first
          rent intelligence platform — starting in Abuja — so you never get
          overcharged on rent again.
        </p>
        <p style="color:#444;line-height:1.6">
          We'll send you an early-access invite the moment we launch. Tell a friend
          who's house-hunting — the more people use it, the smarter the data gets.
        </p>
        <p style="color:#888;font-size:13px;margin-top:32px">
          — The RentInDex team · Powered by Smat Concept
        </p>
      </div>
    `,
  });

  return { success: true, alreadyExists: false };
}

export async function getCount(): Promise<number> {
  const { data: list } = await resend.contacts.list({ audienceId: AUDIENCE_ID });
  const contacts = (list as any)?.data ?? [];
  return contacts.length;
}
