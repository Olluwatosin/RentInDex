"use client";

import Hero from "./components/Hero";
import DataInsights from "./components/DataInsights";
import Problem from "./components/Problem";
import Solution from "./components/Solution";
import HowItWorks from "./components/HowItWorks";
import DataCTA from "./components/DataCTA";
import Waitlist from "./components/Waitlist";
import Footer from "./components/Footer";

export default function Home() {
  return (
    <main className="overflow-x-hidden">
      <Hero />
      <DataInsights />
      <Problem />
      <Solution />
      <HowItWorks />
      <DataCTA />
      <Waitlist />
      <Footer />
    </main>
  );
}
