"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import Link from "next/link";

const STATS = [
  { value: "142+", label: "renters surveyed" },
  { value: "15", label: "states covered" },
  { value: "76", label: "cities represented" },
];

export default function DataCollectionCTA() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section ref={ref} className="py-20 px-6 bg-[#1B4332]">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center"
        >
          <span className="text-3xl">📊</span>
          <h2 className="mt-4 text-3xl sm:text-4xl font-extrabold text-white leading-tight">
            Help Us Build Nigeria&apos;s <br className="hidden sm:block" />
            <span className="text-[#F59E0B]">Rent Database</span>
          </h2>
          <p className="mt-4 text-white/70 text-lg max-w-xl mx-auto leading-relaxed">
            142+ renters have already contributed data from 15 states. The more
            data we have, the more accurately we can tell every Nigerian renter
            what&apos;s fair.
          </p>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="flex flex-wrap justify-center gap-8 mt-10"
        >
          {STATS.map((s, i) => (
            <div key={i} className="text-center">
              <p className="text-3xl font-extrabold text-[#F59E0B]">{s.value}</p>
              <p className="text-white/50 text-sm mt-0.5">{s.label}</p>
            </div>
          ))}
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <Link
            href="/submit"
            className="inline-flex items-center gap-2 bg-[#F59E0B] hover:bg-[#D97706] text-white font-bold px-8 py-4 rounded-full text-base transition-all duration-200 hover:shadow-xl hover:-translate-y-1"
          >
            Submit Your Rent Data
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
          <p className="text-white/40 text-sm">Takes 2 minutes · Completely anonymous</p>
        </motion.div>

        {/* Trust note */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 0.6, delay: 0.45 }}
          className="text-center text-white/30 text-xs mt-8"
        >
          No personal details required · Your data helps every renter in Nigeria
        </motion.p>
      </div>
    </section>
  );
}
