import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://rentindex.com.ng"),
  title: "RentInDex — Know what rent should cost before you pay a kobo",
  description:
    "Nigeria's first rent intelligence platform. Find fair rent prices, calculate true move-in costs, and never get overcharged again. Starting with Abuja.",
  keywords: [
    "rent prices Nigeria",
    "Abuja rent",
    "Nigeria rental market",
    "rent calculator",
    "fair rent",
    "move-in cost",
  ],
  openGraph: {
    title: "RentInDex — Rent smarter, wherever you are",
    description:
      "Know fair rent prices across Nigeria. Never get overcharged again.",
    url: "https://rentindex.com.ng",
    siteName: "RentInDex",
    type: "website",
    locale: "en_NG",
  },
  twitter: {
    card: "summary_large_image",
    title: "RentInDex — Rent smarter, wherever you are",
    description: "Know fair rent prices across Nigeria. Never get overcharged again.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
