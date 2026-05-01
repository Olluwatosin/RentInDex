"use client";

import { motion, useInView } from "framer-motion";
import { useRef, useState } from "react";

export default function Waitlist() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      setMessage("Please enter a valid email address.");
      setStatus("error");
      return;
    }

    setStatus("loading");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (res.ok) {
        setStatus("success");
        setMessage(data.message || "You're on the list! We'll be in touch.");
        setEmail("");
      } else {
        setStatus("error");
        setMessage(data.error || "Something went wrong. Please try again.");
      }
    } catch {
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  };

  return (
    <section id="waitlist" className="py-24 bg-white" ref={ref}>
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid md:grid-cols-2 gap-16 items-center">
          {/* Left text */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-block text-[#F59E0B] font-semibold text-sm uppercase tracking-widest mb-4">
              Early Access
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">
              Be the first to know when we launch
            </h2>
            <p className="text-gray-500 text-lg mb-8 leading-relaxed">
              RentInDex is in active development. Join the waitlist and get early access
              when we launch in Abuja — plus a free Rent Fairness Score for your current
              or next property.
            </p>

            {/* Social proof */}
            <div className="flex items-center gap-4">
              <div className="flex -space-x-2">
                {["A", "B", "C", "D"].map((l, i) => (
                  <div
                    key={i}
                    className="w-9 h-9 rounded-full bg-[#1B4332] border-2 border-white flex items-center justify-center text-white text-xs font-bold"
                    style={{ zIndex: 4 - i }}
                  >
                    {l}
                  </div>
                ))}
              </div>
              <div>
                <p className="text-gray-900 font-semibold text-sm">
                  Join 100+ Nigerians already on the waitlist
                </p>
                <p className="text-gray-400 text-xs">Growing every day</p>
              </div>
            </div>

            {/* Perks */}
            <div className="mt-8 space-y-3">
              {[
                "Early access before public launch",
                "Free Rent Fairness Score on signup",
                "Shape the features we build first",
              ].map((perk, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full bg-[#1B4332]/10 flex items-center justify-center flex-shrink-0">
                    <svg
                      className="w-3 h-3 text-[#1B4332]"
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
                  </div>
                  <span className="text-gray-600 text-sm">{perk}</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Right form */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <div className="bg-gray-50 border border-gray-200 rounded-3xl p-6 sm:p-10">
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                Join the Waitlist
              </h3>
              <p className="text-gray-400 text-sm mb-8">
                Free. No spam. Unsubscribe anytime.
              </p>

              {status === "success" ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-8"
                >
                  <div className="w-16 h-16 rounded-full bg-[#1B4332]/10 flex items-center justify-center mx-auto mb-4">
                    <svg
                      className="w-8 h-8 text-[#1B4332]"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                  <h4 className="text-xl font-bold text-gray-900 mb-2">
                    You&apos;re on the list!
                  </h4>
                  <p className="text-gray-500">{message}</p>
                </motion.div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label
                      htmlFor="email"
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      Email address
                    </label>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (status === "error") setStatus("idle");
                      }}
                      placeholder="you@example.com"
                      className="w-full px-4 py-3.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#1B4332] focus:border-transparent text-gray-900 placeholder:text-gray-400 transition-all"
                      disabled={status === "loading"}
                      required
                    />
                  </div>

                  {status === "error" && message && (
                    <p className="text-red-500 text-sm">{message}</p>
                  )}

                  <button
                    type="submit"
                    disabled={status === "loading"}
                    className="w-full bg-[#1B4332] hover:bg-[#2D6A4F] disabled:opacity-60 text-white font-bold py-4 rounded-xl transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 flex items-center justify-center gap-2"
                  >
                    {status === "loading" ? (
                      <>
                        <svg
                          className="w-4 h-4 animate-spin"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 12a8 8 0 018-8v8H4z"
                          />
                        </svg>
                        Joining...
                      </>
                    ) : (
                      "Join the Waitlist — It's Free"
                    )}
                  </button>

                  <p className="text-center text-xs text-gray-400">
                    By joining, you agree to receive updates about RentInDex. No spam,
                    ever.
                  </p>
                </form>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
