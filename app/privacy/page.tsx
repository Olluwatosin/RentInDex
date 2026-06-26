import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — RentInDex",
  description: "How RentInDex collects, uses, and protects your data.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-6 py-20">
        <Link
          href="/"
          className="text-sm text-[#1B4332] hover:underline mb-10 inline-block"
        >
          ← Back to RentInDex
        </Link>

        <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-400 mb-10">Last updated: June 2025</p>

        <div className="prose prose-gray max-w-none space-y-8 text-gray-700 leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Who we are</h2>
            <p>
              RentInDex is a rent intelligence platform built by Smat Concept to help Nigerian
              renters understand fair market prices and calculate true move-in costs. Our website
              is{" "}
              <a
                href="https://rentindex.com.ng"
                className="text-[#1B4332] hover:underline"
              >
                rentindex.com.ng
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">What data we collect</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>Rent data</strong> — state, area, property type, rent range, and
                move-in costs you submit via our form or chatbot. This data is anonymous by
                default; you can optionally provide your email.
              </li>
              <li>
                <strong>Email address</strong> — if you join our waitlist or voluntarily
                share it during data submission. We use this to send you updates and early
                access notifications.
              </li>
              <li>
                <strong>Chatbot conversations</strong> — messages you send to RentBot are
                processed to provide responses and extract rent data (with your participation).
                Conversations are not stored permanently.
              </li>
              <li>
                <strong>Usage data</strong> — standard analytics (page views, session counts)
                collected anonymously via Vercel Analytics.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">How we use your data</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>To build aggregated, anonymous rent price statistics for Nigerian renters.</li>
              <li>To send you product updates and early access notifications (if you joined the waitlist).</li>
              <li>To notify you that we received your rent data submission (one confirmation email).</li>
              <li>We do not sell, rent, or share your personal data with third parties for marketing.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Third-party services</h2>
            <p>We use the following services to operate the platform:</p>
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li>
                <strong>Resend</strong> — email delivery and audience management.
              </li>
              <li>
                <strong>Google Sheets</strong> — storage for anonymised rent data submitted
                via the chatbot.
              </li>
              <li>
                <strong>Groq / OpenRouter</strong> — AI inference for the RentBot chatbot.
                Your chatbot messages are sent to these providers for processing.
              </li>
              <li>
                <strong>Vercel</strong> — hosting and analytics.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Data retention</h2>
            <p>
              Anonymised rent data (no email) is retained indefinitely to improve our dataset.
              Email addresses are retained until you unsubscribe. You can request deletion at
              any time by emailing us.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Your rights</h2>
            <p>
              You can request access to, correction of, or deletion of any personal data we
              hold about you. To exercise these rights, email us at{" "}
              <a
                href="mailto:hello@rentindex.ng"
                className="text-[#1B4332] hover:underline"
              >
                hello@rentindex.ng
              </a>
              . We will respond within 14 days.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Changes to this policy</h2>
            <p>
              We may update this policy as the platform evolves. Material changes will be
              communicated to waitlist members via email. Continued use of the platform
              constitutes acceptance of the current policy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Contact</h2>
            <p>
              Questions about this policy? Reach us at{" "}
              <a
                href="mailto:hello@rentindex.ng"
                className="text-[#1B4332] hover:underline"
              >
                hello@rentindex.ng
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
