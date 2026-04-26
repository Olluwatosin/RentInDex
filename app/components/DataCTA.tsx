"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const GOOGLE_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLScnKYPOeajElWeapoxLw1ZP7dKEvpqeUb-NwzIw61kKqq0YOQ/viewform";

const reasons = [
  "Takes less than 3 minutes",
  "Your data is anonymous",
  "Directly powers the Rent Index",
  "Helps every Nigerian renter after you",
];

export default function DataCTA() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section className="py-24 bg-gray-50" ref={ref}>
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="bg-gradient-to-br from-[#1B4332] to-[#2D6A4F] rounded-3xl overflow-hidden"
        >
          <div className="grid md:grid-cols-2 gap-0">
            {/* Left content */}
            <div className="p-10 sm:p-14">
              <span className="inline-block text-[#F59E0B] font-semibold text-sm uppercase tracking-widest mb-6">
                Data Collection
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4 leading-tight">
                Help us build Nigeria&apos;s rent database
              </h2>
              <p className="text-white/70 text-lg mb-8 leading-relaxed">
                RentInDex is only as powerful as the data behind it. Share what you pay
                (or paid) in rent — it&apos;s the single most impactful thing you can do
                to make renting fair for all Nigerians.
              </p>

              {/* Reasons list */}
              <ul className="space-y-3 mb-10">
                {reasons.map((r, i) => (
                  <motion.li
                    key={i}
                    initial={{ opacity: 0, x: -20 }}
                    animate={isInView ? { opacity: 1, x: 0 } : {}}
                    transition={{ duration: 0.4, delay: 0.3 + i * 0.1 }}
                    className="flex items-center gap-3 text-white/80"
                  >
                    <span className="w-5 h-5 rounded-full bg-[#F59E0B]/20 border border-[#F59E0B]/40 flex items-center justify-center flex-shrink-0">
                      <svg
                        className="w-3 h-3 text-[#F59E0B]"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </span>
                    {r}
                  </motion.li>
                ))}
              </ul>

              <motion.a
                href={GOOGLE_FORM_URL}
                target="_blank"
                rel="noopener noreferrer"
                initial={{ opacity: 0 }}
                animate={isInView ? { opacity: 1 } : {}}
                transition={{ duration: 0.5, delay: 0.7 }}
                className="inline-flex items-center gap-3 bg-[#F59E0B] hover:bg-[#D97706] text-white font-bold px-8 py-4 rounded-full text-base transition-all duration-200 hover:shadow-xl hover:-translate-y-1 group"
              >
                Fill the Data Form
                <svg
                  className="w-5 h-5 group-hover:translate-x-1 transition-transform"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </motion.a>
            </div>

            {/* Right visual */}
            <div className="relative hidden md:flex items-center justify-center p-10 border-l border-white/10">
              <div className="space-y-4 w-full max-w-xs">
                {/* Fake form card */}
                {[
                  { label: "Your area", value: "Gwarinpa, Abuja" },
                  { label: "Property type", value: "2-bedroom flat" },
                  { label: "Annual rent", value: "₦900,000" },
                  { label: "Agency fee paid", value: "₦90,000 (10%)" },
                ].map((field, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: 30 }}
                    animate={isInView ? { opacity: 1, x: 0 } : {}}
                    transition={{ duration: 0.4, delay: 0.4 + i * 0.1 }}
                    className="bg-white/10 border border-white/20 rounded-xl p-4"
                  >
                    <p className="text-white/50 text-xs mb-1">{field.label}</p>
                    <p className="text-white font-semibold text-sm">{field.value}</p>
                  </motion.div>
                ))}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={isInView ? { opacity: 1 } : {}}
                  transition={{ duration: 0.4, delay: 0.9 }}
                  className="bg-[#F59E0B] rounded-xl p-4 text-center"
                >
                  <p className="text-white font-bold">Submit &rarr;</p>
                </motion.div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
