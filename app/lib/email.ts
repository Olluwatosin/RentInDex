// Unified email sending. Prefers Brevo (real founder@rentindex.com.ng sender)
// when BREVO_API_KEY is set; otherwise falls back to Resend's shared sender.
import { Resend } from "resend";

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || "founder@rentindex.com.ng";
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || "RentInDex";
const BREVO_LIST_ID = process.env.BREVO_LIST_ID; // waitlist contact list, optional

const RESEND_FROM = "RentInDex <onboarding@resend.dev>";

export function brevoConfigured(): boolean {
  return Boolean(BREVO_API_KEY);
}

interface SendArgs {
  to: string;
  subject: string;
  html: string;
}

// Send one transactional email. Returns true on success (best-effort; callers
// generally shouldn't fail their request just because an email didn't send).
export async function sendEmail({ to, subject, html }: SendArgs): Promise<boolean> {
  if (BREVO_API_KEY) {
    try {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": BREVO_API_KEY,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          sender: { name: BREVO_SENDER_NAME, email: BREVO_SENDER_EMAIL },
          to: [{ email: to }],
          subject,
          htmlContent: html,
        }),
      });
      if (!res.ok) {
        console.error(`Brevo send failed (${res.status}): ${await res.text()}`);
        return false;
      }
      return true;
    } catch (err) {
      console.error("Brevo send error:", err);
      return false;
    }
  }

  // Fallback: Resend
  if (process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({ from: RESEND_FROM, to, subject, html });
      return true;
    } catch (err) {
      console.error("Resend send error:", err);
      return false;
    }
  }
  return false;
}

// Add/refresh a contact on the waitlist list, for broadcasts. Uses Brevo if
// configured (BREVO_LIST_ID), else Resend audience.
//
// Returns the provider that accepted the contact, or null if none did. The
// caller records that so unsynced signups can be retried — the durable copy
// lives in our own database, not here.
export async function addWaitlistContact(email: string): Promise<string | null> {
  if (BREVO_API_KEY) {
    try {
      const res = await fetch("https://api.brevo.com/v3/contacts", {
        method: "POST",
        headers: {
          "api-key": BREVO_API_KEY,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          email,
          updateEnabled: true,
          listIds: BREVO_LIST_ID ? [Number(BREVO_LIST_ID)] : undefined,
        }),
      });
      if (!res.ok) {
        console.error(`Brevo contact add failed (${res.status}): ${await res.text()}`);
        return null;
      }
      return "brevo";
    } catch (err) {
      console.error("Brevo contact add error:", err);
      return null;
    }
  }
  if (process.env.RESEND_API_KEY && process.env.RESEND_AUDIENCE_ID) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.contacts.create({
        audienceId: process.env.RESEND_AUDIENCE_ID,
        email,
        unsubscribed: false,
      });
      return "resend";
    } catch (err) {
      console.error("Resend contact add error:", err);
      return null;
    }
  }
  return null;
}
