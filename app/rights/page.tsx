import type { Metadata } from "next";
import RightsChecker from "@/app/components/RightsChecker";

// Written for the searches Nigerian renters actually type — "can my landlord
// increase my rent", "how much notice must a landlord give in Lagos", "is 2
// years rent in advance legal" — because organic search is the only channel
// that works while the site has no audience.
export const metadata: Metadata = {
  title: "Know your rights as a Lagos tenant — RentInDex",
  description:
    "Can your landlord raise your rent? How much quit notice are you owed? Is two years upfront legal? Answers straight from the Lagos State Tenancy Law 2011, with the section quoted so you can show it to anyone.",
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
    title: "Know your rights as a Lagos tenant",
    description:
      "Rent increase, quit notice, years of rent upfront, lock-outs — what the Lagos Tenancy Law 2011 actually says, with the section quoted.",
    url: "https://rentindex.com.ng/rights",
    siteName: "RentInDex",
    type: "website",
    locale: "en_NG",
  },
  twitter: {
    card: "summary_large_image",
    title: "Know your rights as a Lagos tenant",
    description:
      "What the Lagos Tenancy Law 2011 actually says about your rent increase, your quit notice, and that two-years-upfront demand.",
  },
};

export default function RightsPage() {
  return <RightsChecker />;
}
