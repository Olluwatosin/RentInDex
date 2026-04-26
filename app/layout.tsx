import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
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
    type: "website",
    locale: "en_NG",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
