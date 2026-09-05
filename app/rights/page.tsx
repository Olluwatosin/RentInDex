import { Suspense } from "react";
import type { Metadata } from "next";
import RightsChecker from "@/app/components/RightsChecker";

const BASE = "https://rentindex.com.ng";

const DEFAULT_TITLE = "Know your rights as a Lagos tenant";
const DEFAULT_DESC =
  "Can your landlord raise your rent? How much quit notice are you owed? Is two years upfront legal? Answers straight from the Lagos State Tenancy Law 2011, with the section quoted so you can show it to anyone.";

type SearchParams = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// A shared answer carries its inputs in the URL, so the link previews as the
// verdict card and the person who receives it lands on the same answer rather
// than an empty form. That round trip — forward, see the card, tap, get your
// own answer — is the whole distribution loop.
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const situation = one(sp.situation);

  const card = new URLSearchParams();
  for (const key of [
    "situation", "area", "type", "months", "from", "to",
    "agreed", "sitting", "lockedOut", "damaged", "threatened", "utilities", "order",
  ]) {
    const v = one(sp[key]);
    if (v) card.set(key, v);
  }

  const hasAnswer = Boolean(situation);
  const image = hasAnswer ? `${BASE}/api/card?${card.toString()}` : undefined;
  const area = one(sp.area);

  const title = hasAnswer && area ? `${DEFAULT_TITLE} — ${area}` : DEFAULT_TITLE;

  return {
    title: `${title} — RentInDex`,
    description: DEFAULT_DESC,
    keywords: [
      "Lagos tenancy law",
      "quit notice Nigeria",
      "rent increase Lagos",
      "tenant rights Nigeria",
      "two years rent in advance",
      "landlord locked me out Lagos",
      "Lagos Tenancy Law 2011",
    ],
    alternates: { canonical: "/rights" },
    openGraph: {
      title,
      description: DEFAULT_DESC,
      url: `${BASE}/rights`,
      siteName: "RentInDex",
      type: "website",
      locale: "en_NG",
      ...(image ? { images: [{ url: image, width: 1200, height: 630 }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: DEFAULT_DESC,
      ...(image ? { images: [image] } : {}),
    },
  };
}

export default function RightsPage() {
  return (
    // useSearchParams (a shared link carries the answer) needs a Suspense boundary.
    <Suspense fallback={<div className="min-h-screen bg-[#1B4332]" />}>
      <RightsChecker />
    </Suspense>
  );
}
