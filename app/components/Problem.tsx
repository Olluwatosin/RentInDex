"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const problems = [
  {
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
    title: "No transparency on fair rent prices",
    description:
      "Landlords quote whatever price they want. There is no public data on what rent should actually cost in any neighbourhood. Renters are negotiating blind.",
    stat: "0 publicly available",
    statLabel: "rent price databases in Nigeria",
  },
  {
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
    title: "Hidden fees inflate true cost by 40–50%",
    description:
      "Beyond the annual rent, you pay agency fees, caution fees, legal fees, and sometimes 2 years upfront. The real move-in cost is almost never disclosed upfront.",
    stat: "40–50%",
    statLabel: "extra you actually pay beyond quoted rent",
  },
  {
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
        />
      </svg>
    ),
    title: "Renters have no data to negotiate with",
    description:
      "When a landlord quotes ₦1.2m for a 2-bedroom in Gwarinpa, how do you know if that is fair? Without data, you either overpay or walk away from a potentially good deal.",
    stat: "₦0",
    statLabel: "negotiating leverage without market data",
  },
];

export default function Problem() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section className="py-24 bg-white" ref={ref}>
      <div className="max-w-6xl mx-auto px-6">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-block text-[#F59E0B] font-semibold text-sm uppercase tracking-widest mb-4">
            The Problem
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">
            The problem with renting in Nigeria
          </h2>
          <p className="text-gray-500 text-lg max-w-2xl mx-auto">
            Millions of Nigerians are at the mercy of landlords and agents with zero
            market data to protect themselves.
          </p>
        </motion.div>

        {/* Problem cards */}
        <div className="grid md:grid-cols-3 gap-8">
          {problems.map((problem, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 40 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: i * 0.15 }}
              className="group relative bg-gray-50 rounded-2xl p-8 border border-gray-100 hover:border-[#1B4332]/20 hover:shadow-lg transition-all duration-300"
            >
              {/* Icon */}
              <div className="w-14 h-14 rounded-xl bg-[#1B4332]/10 text-[#1B4332] flex items-center justify-center mb-6 group-hover:bg-[#1B4332] group-hover:text-white transition-all duration-300">
                {problem.icon}
              </div>

              {/* Content */}
              <h3 className="text-xl font-bold text-gray-900 mb-3">{problem.title}</h3>
              <p className="text-gray-500 leading-relaxed mb-6">{problem.description}</p>

              {/* Stat */}
              <div className="pt-6 border-t border-gray-200">
                <p className="text-2xl font-extrabold text-[#1B4332]">{problem.stat}</p>
                <p className="text-sm text-gray-400 mt-1">{problem.statLabel}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Bottom callout */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-12 bg-[#1B4332] rounded-2xl p-8 text-center"
        >
          <p className="text-white/90 text-lg">
            <span className="text-[#F59E0B] font-bold">RentInDex</span> is built to fix
            exactly this — with real data, real transparency, and tools that put the power
            back in renters&apos; hands.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
