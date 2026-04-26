"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const steps = [
  {
    step: "01",
    title: "Enter your budget",
    description:
      "Tell us your monthly or annual rent budget — in naira, no conversions needed. Be honest; RentInDex works best with your real numbers.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
        />
      </svg>
    ),
  },
  {
    step: "02",
    title: "See matching neighbourhoods",
    description:
      "Instantly see all neighbourhoods in Abuja where your budget is realistic, with verified rent ranges, property types, and commute context.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    ),
  },
  {
    step: "03",
    title: "Know your true move-in cost",
    description:
      "Before you sign anything, see your full financial picture — annual rent plus every fee, so you walk into any negotiation fully informed.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
        />
      </svg>
    ),
  },
];

export default function HowItWorks() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section className="py-24 bg-white" ref={ref}>
      <div className="max-w-6xl mx-auto px-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-block text-[#F59E0B] font-semibold text-sm uppercase tracking-widest mb-4">
            How It Works
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">
            Three steps. Total clarity.
          </h2>
          <p className="text-gray-500 text-lg max-w-2xl mx-auto">
            RentInDex is designed to be fast and intuitive. No account needed, no jargon —
            just answers.
          </p>
        </motion.div>

        {/* Steps */}
        <div className="relative">
          {/* Connector line (desktop) */}
          <div className="hidden md:block absolute top-16 left-[16.66%] right-[16.66%] h-0.5 bg-gradient-to-r from-[#1B4332]/20 via-[#1B4332] to-[#1B4332]/20" />

          <div className="grid md:grid-cols-3 gap-10">
            {steps.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 40 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.6, delay: i * 0.2 }}
                className="flex flex-col items-center text-center"
              >
                {/* Step circle */}
                <div className="relative z-10 w-16 h-16 rounded-full bg-[#1B4332] flex items-center justify-center text-white mb-6 shadow-lg shadow-[#1B4332]/30">
                  {step.icon}
                  <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[#F59E0B] text-white text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                </div>

                {/* Content */}
                <h3 className="text-xl font-bold text-gray-900 mb-3">{step.title}</h3>
                <p className="text-gray-500 leading-relaxed">{step.description}</p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Visual mockup strip */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, delay: 0.6 }}
          className="mt-16 bg-[#1B4332] rounded-3xl p-8 sm:p-12 overflow-hidden relative"
        >
          <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div>
              <h3 className="text-2xl font-bold text-white mb-2">
                Launching first in Abuja
              </h3>
              <p className="text-white/70">
                We&apos;re starting with Nigeria&apos;s capital and expanding city by city.
              </p>
            </div>
            <div className="flex gap-3">
              {["Maitama", "Garki", "Gwarinpa", "Asokoro", "Wuse II"].map((area) => (
                <span
                  key={area}
                  className="bg-white/10 text-white/90 text-sm font-medium px-3 py-2 rounded-full whitespace-nowrap"
                >
                  {area}
                </span>
              ))}
            </div>
          </div>
          {/* Decorative */}
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-[#F59E0B]/10 blur-3xl" />
        </motion.div>
      </div>
    </section>
  );
}
