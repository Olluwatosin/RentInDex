"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const features = [
  {
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
        />
      </svg>
    ),
    name: "Rent Index",
    tagline: "Fair prices by area",
    description:
      "Browse verified rent ranges for every neighbourhood in Abuja — from Maitama to Kuje. Know the market before you even call an agent.",
    color: "from-green-50 to-emerald-50",
    accent: "#1B4332",
    badge: "Core Feature",
  },
  {
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"
        />
      </svg>
    ),
    name: "Budget Matcher",
    tagline: "Find where you fit",
    description:
      "Enter your monthly or annual budget and see exactly which neighbourhoods and property types are realistic for you. No more wasted viewings.",
    color: "from-amber-50 to-yellow-50",
    accent: "#D97706",
    badge: "Smart Tool",
  },
  {
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
        />
      </svg>
    ),
    name: "Rent Fairness Score",
    tagline: "Is your price fair?",
    description:
      "Paste in the rent a landlord quoted you. Get an instant fairness rating — Underpriced, Fair, or Overpriced — backed by real neighbourhood data.",
    color: "from-blue-50 to-indigo-50",
    accent: "#2563EB",
    badge: "Negotiation Tool",
  },
  {
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
        />
      </svg>
    ),
    name: "Total Package Calculator",
    tagline: "True move-in cost",
    description:
      "Calculate your full move-in cost — annual rent, agency fee, caution deposit, legal fee — broken down clearly so you can plan and budget with confidence.",
    color: "from-purple-50 to-pink-50",
    accent: "#7C3AED",
    badge: "Budget Planner",
  },
];

export default function Solution() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section className="py-24 bg-gray-50" ref={ref}>
      <div className="max-w-6xl mx-auto px-6">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-block text-[#F59E0B] font-semibold text-sm uppercase tracking-widest mb-4">
            The Solution
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">
            What RentInDex gives you
          </h2>
          <p className="text-gray-500 text-lg max-w-2xl mx-auto">
            Four powerful tools that transform how Nigerians find, evaluate, and budget
            for their next home.
          </p>
        </motion.div>

        {/* Feature cards */}
        <div className="grid sm:grid-cols-2 gap-6">
          {features.map((feature, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 40 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: i * 0.1 }}
              className={`relative bg-gradient-to-br ${feature.color} rounded-2xl p-8 border border-white hover:shadow-lg transition-all duration-300`}
            >
              {/* Badge */}
              <span
                className="inline-block text-xs font-semibold px-3 py-1 rounded-full mb-6 text-white"
                style={{ backgroundColor: feature.accent }}
              >
                {feature.badge}
              </span>

              {/* Icon */}
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center mb-5"
                style={{ backgroundColor: feature.accent + "15", color: feature.accent }}
              >
                {feature.icon}
              </div>

              {/* Content */}
              <h3 className="text-xl font-bold text-gray-900 mb-1">{feature.name}</h3>
              <p
                className="text-sm font-semibold mb-3"
                style={{ color: feature.accent }}
              >
                {feature.tagline}
              </p>
              <p className="text-gray-600 leading-relaxed">{feature.description}</p>

              {/* Coming soon indicator */}
              <div className="mt-6 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#F59E0B] animate-pulse" />
                <span className="text-xs text-gray-400 font-medium">Coming soon</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
