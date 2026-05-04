"use client";

import { motion, AnimatePresence, useInView } from "framer-motion";
import { useRef, useState } from "react";

const GOOGLE_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLScnKYPOeajElWeapoxLw1ZP7dKEvpqeUb-NwzIw61kKqq0YOQ/viewform";

type FlowStep = "form" | "email" | "success";

export default function Waitlist() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  const [step, setStep] = useState<FlowStep>("form");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const openForm = () => {
    window.open(GOOGLE_FORM_URL, "_blank", "noopener,noreferrer");
    // After a short delay, advance to the email step so they can join the waitlist
    setTimeout(() => setStep("email"), 800);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      setErrorMsg("Please enter a valid email address.");
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
        setStep("success");
        setEmail("");
      } else {
        setStatus("error");
        setErrorMsg(data.error || "Something went wrong. Please try again.");
      }
    } catch {
      setStatus("error");
      setErrorMsg("Network error. Please try again.");
    }
  };

  return (
    <section id="waitlist" className="py-24 bg-white" ref={ref}>
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid md:grid-cols-2 gap-16 items-center">

          {/* Left — context */}
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
              RentInDex is in active development. Your rent data helps us build
              the most accurate rent intelligence in Nigeria — join the waitlist
              and get early access when we launch in Abuja.
            </p>

            {/* Social proof */}
            <div className="flex items-center gap-4 mb-8">
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
                  100+ Nigerians already on the waitlist
                </p>
                <p className="text-gray-400 text-xs">Growing every day</p>
              </div>
            </div>

            {/* Perks */}
            <div className="space-y-3">
              {[
                "Early access before public launch",
                "Free Rent Fairness Score on signup",
                "Shape the features we build first",
              ].map((perk, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full bg-[#1B4332]/10 flex items-center justify-center flex-shrink-0">
                    <svg className="w-3 h-3 text-[#1B4332]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-gray-600 text-sm">{perk}</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Right — flow card */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <div className="bg-gray-50 border border-gray-200 rounded-3xl p-6 sm:p-10 overflow-hidden">

              {/* Step indicator */}
              {step !== "success" && (
                <div className="flex items-center gap-2 mb-6">
                  {["form", "email"].map((s, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                          step === s || (s === "form" && step === "email")
                            ? "bg-[#1B4332] text-white"
                            : "bg-gray-200 text-gray-500"
                        }`}
                      >
                        {s === "form" && step === "email" ? "✓" : i + 1}
                      </div>
                      <span className="text-xs text-gray-500">
                        {s === "form" ? "Fill data form" : "Join waitlist"}
                      </span>
                      {i === 0 && <div className="w-6 h-px bg-gray-300 mx-1" />}
                    </div>
                  ))}
                </div>
              )}

              <AnimatePresence mode="wait">

                {/* ── Step 1: Data Form ──────────────────────────────── */}
                {step === "form" && (
                  <motion.div
                    key="form"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.25 }}
                  >
                    <div className="text-center mb-6">
                      <span className="text-4xl">📊</span>
                      <h3 className="text-xl font-bold text-gray-900 mt-3 mb-2">
                        First, help us build better rent data
                      </h3>
                      <p className="text-gray-500 text-sm leading-relaxed">
                        We&apos;re gathering real rent data across Nigeria. Your 2-minute
                        response directly improves the intelligence we&apos;ll serve back to
                        you — and every renter after you.
                      </p>
                    </div>

                    <button
                      onClick={openForm}
                      className="w-full bg-[#F59E0B] hover:bg-[#D97706] text-white font-bold py-4 rounded-xl transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 flex items-center justify-center gap-2 mb-4"
                    >
                      Fill the Data Form — 2 mins
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </button>

                    <button
                      onClick={() => setStep("email")}
                      className="w-full text-gray-400 hover:text-gray-600 text-sm py-2 transition-colors"
                    >
                      Already filled it? Skip to waitlist →
                    </button>
                  </motion.div>
                )}

                {/* ── Step 2: Email ──────────────────────────────────── */}
                {step === "email" && (
                  <motion.div
                    key="email"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.25 }}
                  >
                    <h3 className="text-xl font-bold text-gray-900 mb-1">
                      Join the Waitlist
                    </h3>
                    <p className="text-gray-400 text-sm mb-6">
                      Free. No spam. Unsubscribe anytime.
                    </p>

                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div>
                        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
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

                      {status === "error" && errorMsg && (
                        <p className="text-red-500 text-sm">{errorMsg}</p>
                      )}

                      <button
                        type="submit"
                        disabled={status === "loading"}
                        className="w-full bg-[#1B4332] hover:bg-[#2D6A4F] disabled:opacity-60 text-white font-bold py-4 rounded-xl transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 flex items-center justify-center gap-2"
                      >
                        {status === "loading" ? (
                          <>
                            <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12a8 8 0 018-8v8H4z" />
                            </svg>
                            Joining...
                          </>
                        ) : (
                          "Join the Waitlist — It's Free"
                        )}
                      </button>

                      <p className="text-center text-xs text-gray-400">
                        By joining, you agree to receive updates about RentInDex.
                      </p>
                    </form>

                    <button
                      onClick={() => setStep("form")}
                      className="w-full text-gray-400 hover:text-gray-600 text-xs mt-3 py-1 transition-colors"
                    >
                      ← Back to data form
                    </button>
                  </motion.div>
                )}

                {/* ── Step 3: Success ────────────────────────────────── */}
                {step === "success" && (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3 }}
                    className="text-center py-6"
                  >
                    <div className="w-16 h-16 rounded-full bg-[#1B4332]/10 flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-[#1B4332]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h4 className="text-xl font-bold text-gray-900 mb-2">You&apos;re on the list!</h4>
                    <p className="text-gray-500 text-sm leading-relaxed mb-6">
                      We&apos;ll notify you first when RentInDex launches in Abuja.
                    </p>
                    <a
                      href={GOOGLE_FORM_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm font-semibold text-[#1B4332] hover:text-[#2D6A4F] transition-colors"
                    >
                      Haven&apos;t filled the data form yet? It takes 2 mins →
                    </a>
                  </motion.div>
                )}

              </AnimatePresence>
            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}
