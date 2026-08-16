import { Suspense } from "react";
import type { Metadata } from "next";
import MoveInCalculator from "@/app/components/MoveInCalculator";

export const metadata: Metadata = {
  title: "True move-in cost calculator — RentInDex",
  description:
    "The advertised rent is never what you pay. Add agency, finder's, caution and service fees at the rates Nigerian renters actually reported, and see what you really need on day one.",
  alternates: { canonical: "/calculator" },
  openGraph: {
    title: "What will moving in actually cost?",
    description:
      "Agency, finder's, caution, service charge — at the rates Nigerian renters actually reported. Built on real survey data, not guesswork.",
    url: "https://rentindex.com.ng/calculator",
    siteName: "RentInDex",
    type: "website",
    locale: "en_NG",
  },
  twitter: {
    card: "summary_large_image",
    title: "What will moving in actually cost?",
    description:
      "Agency, finder's, caution, service charge — at the rates Nigerian renters actually reported.",
  },
};

export default function CalculatorPage() {
  return (
    // useSearchParams (shared links carry the numbers) needs a Suspense boundary.
    <Suspense fallback={<div className="min-h-screen bg-green-950" />}>
      <MoveInCalculator />
    </Suspense>
  );
}
