"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

// ─── data ─────────────────────────────────────────────────────────────────────

const STATES = [
  "FCT Abuja", "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa",
  "Benue", "Borno", "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu",
  "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi",
  "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo",
  "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara",
];

const PROPERTY_TYPES = [
  "Self-contained",
  "Mini flat",
  "1 Bedroom flat",
  "2 Bedroom flat",
  "3 Bedroom flat",
  "Duplex / Bungalow",
];

const RENT_RANGES = [
  "Below ₦150,000",
  "₦150,000 – ₦300,000",
  "₦300,000 – ₦600,000",
  "₦600,000 – ₦1,000,000",
  "₦1,000,000 – ₦2,000,000",
  "Above ₦2,000,000",
];

const COST_RANGES = [
  "Below ₦300,000",
  "₦300,000 – ₦600,000",
  "₦600,000 – ₦1,000,000",
  "₦1,000,000 – ₦2,000,000",
  "Above ₦2,000,000",
];

const TOTAL_STEPS = 6; // 5 questions + email

// ─── animation variants ───────────────────────────────────────────────────────

const variants = {
  enter: (dir: number) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
  center: { x: 0, opacity: 1, transition: { duration: 0.28, ease: "easeOut" } },
  exit: (dir: number) => ({
    x: dir > 0 ? -60 : 60,
    opacity: 0,
    transition: { duration: 0.2, ease: "easeIn" },
  }),
};

// ─── radio card ───────────────────────────────────────────────────────────────

function RadioCard({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left px-4 py-3.5 rounded-xl border-2 transition-all duration-150 text-sm font-medium flex items-center gap-3 ${
        selected
          ? "border-[#1B4332] bg-[#1B4332]/5 text-[#1B4332]"
          : "border-gray-200 hover:border-gray-300 text-gray-700 bg-white"
      }`}
    >
      <span
        className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition-all ${
          selected ? "border-[#1B4332] bg-[#1B4332]" : "border-gray-300"
        }`}
      >
        {selected && (
          <span className="w-full h-full flex items-center justify-center">
            <span className="w-1.5 h-1.5 rounded-full bg-white block" />
          </span>
        )}
      </span>
      {label}
    </button>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

interface FormData {
  state: string;
  area: string;
  propertyType: string;
  rentRange: string;
  totalCostRange: string;
  email: string;
}

export default function SubmitDataForm() {
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState<FormData>({
    state: "",
    area: "",
    propertyType: "",
    rentRange: "",
    totalCostRange: "",
    email: "",
  });

  const set = (field: keyof FormData, value: string) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  const canProceed = () => {
    if (step === 0) return formData.state !== "";
    if (step === 1) return formData.area.trim() !== "";
    if (step === 2) return formData.propertyType !== "";
    if (step === 3) return formData.rentRange !== "";
    return true; // steps 4 and 5 are optional
  };

  const next = () => {
    if (!canProceed()) return;
    setDir(1);
    setStep((s) => s + 1);
  };

  const back = () => {
    setDir(-1);
    setStep((s) => s - 1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") next();
  };

  const submit = async () => {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/submit-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (res.ok) {
        setSubmitted(true);
      } else {
        setError(data.error || "Something went wrong. Please try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const whatsappText = encodeURIComponent(
    `I just submitted my rent data to RentInDex — Nigeria's first rent intelligence platform! 🏠\n\nThey're building a database so renters never get overcharged again. Takes 2 minutes:\nhttps://rentindex.com.ng/submit`
  );
  const whatsappURL = `https://wa.me/?text=${whatsappText}`;

  // ── Success screen ──────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-16">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-gray-100 p-8 text-center"
        >
          <div className="w-16 h-16 rounded-full bg-[#1B4332]/10 flex items-center justify-center mx-auto mb-5">
            <svg className="w-8 h-8 text-[#1B4332]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h2 className="text-2xl font-extrabold text-gray-900 mb-2">Thank you for contributing! 🏠</h2>
          <p className="text-gray-500 text-sm mb-6 leading-relaxed">
            Based on your submission:
          </p>

          <div className="bg-gray-50 rounded-2xl p-5 text-left mb-6 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Property</span>
              <span className="font-semibold text-gray-900">{formData.propertyType} in {formData.area}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">State</span>
              <span className="font-semibold text-gray-900">{formData.state}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Annual rent</span>
              <span className="font-semibold text-[#1B4332]">{formData.rentRange}</span>
            </div>
          </div>

          <div className="space-y-2 mb-8 text-left">
            {[
              "Your data has been recorded",
              "You'll get FREE early access at launch",
              "Share with someone renting in Nigeria",
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-gray-700">
                <span className="text-green-500 font-bold">✅</span>
                {item}
              </div>
            ))}
          </div>

          <a
            href={whatsappURL}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1ebe57] text-white font-bold py-4 rounded-xl transition-all duration-200 hover:shadow-lg mb-3"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            Share on WhatsApp
          </a>

          <Link
            href="/"
            className="block text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            ← Back to RentInDex
          </Link>
        </motion.div>
      </div>
    );
  }

  // ── Form screen ─────────────────────────────────────────────────────────────

  const progressPct = Math.round((step / TOTAL_STEPS) * 100);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#1B4332] flex items-center justify-center">
              <span className="text-white font-bold text-sm">R</span>
            </div>
            <span className="font-bold text-[#1B4332] text-lg">RentInDex</span>
          </Link>
          <span className="text-gray-400 text-sm">Step {step + 1} of {TOTAL_STEPS}</span>
        </div>

        {/* Progress bar */}
        <div className="max-w-lg mx-auto mt-4">
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-[#1B4332] rounded-full"
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
        </div>
      </div>

      {/* Form body */}
      <div className="flex-1 flex items-start justify-center px-4 pt-10 pb-24">
        <div className="w-full max-w-lg">

          {/* Title — shown only on step 0 */}
          {step === 0 && (
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8 text-center"
            >
              <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mb-2">
                Submit Your Rent Data 🏠
              </h1>
              <p className="text-gray-500 text-sm leading-relaxed max-w-sm mx-auto">
                Help us build Nigeria&apos;s most accurate rent database. Takes 2 minutes.
                Completely anonymous. Free early access when we launch.
              </p>
            </motion.div>
          )}

          {/* Animated question */}
          <div className="overflow-hidden">
            <AnimatePresence custom={dir} mode="wait">
              <motion.div
                key={step}
                custom={dir}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
              >
                {/* ── Step 0: State ───────────────────────────────────── */}
                {step === 0 && (
                  <div>
                    <label className="block text-lg font-bold text-gray-900 mb-1">
                      Which state are you in?
                    </label>
                    <p className="text-gray-400 text-sm mb-5">Required</p>
                    <select
                      value={formData.state}
                      onChange={(e) => set("state", e.target.value)}
                      className="w-full px-4 py-3.5 rounded-xl border-2 border-gray-200 focus:outline-none focus:border-[#1B4332] text-gray-900 bg-white text-sm transition-all"
                    >
                      <option value="">Select your state...</option>
                      {STATES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* ── Step 1: Area ────────────────────────────────────── */}
                {step === 1 && (
                  <div>
                    <label className="block text-lg font-bold text-gray-900 mb-1">
                      Which area or neighborhood?
                    </label>
                    <p className="text-gray-400 text-sm mb-5">Required</p>
                    <input
                      type="text"
                      value={formData.area}
                      onChange={(e) => set("area", e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="e.g. Gwarinpa, Lekki, GRA, Barnawa"
                      autoFocus
                      className="w-full px-4 py-3.5 rounded-xl border-2 border-gray-200 focus:outline-none focus:border-[#1B4332] text-gray-900 placeholder:text-gray-400 text-sm transition-all"
                    />
                  </div>
                )}

                {/* ── Step 2: Property type ──────────────────────────── */}
                {step === 2 && (
                  <div>
                    <label className="block text-lg font-bold text-gray-900 mb-1">
                      What type of apartment?
                    </label>
                    <p className="text-gray-400 text-sm mb-5">Required</p>
                    <div className="space-y-2.5">
                      {PROPERTY_TYPES.map((opt) => (
                        <RadioCard
                          key={opt}
                          label={opt}
                          selected={formData.propertyType === opt}
                          onSelect={() => { set("propertyType", opt); }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Step 3: Rent range ─────────────────────────────── */}
                {step === 3 && (
                  <div>
                    <label className="block text-lg font-bold text-gray-900 mb-1">
                      How much is your annual rent? (₦)
                    </label>
                    <p className="text-gray-400 text-sm mb-5">Required</p>
                    <div className="space-y-2.5">
                      {RENT_RANGES.map((opt) => (
                        <RadioCard
                          key={opt}
                          label={opt}
                          selected={formData.rentRange === opt}
                          onSelect={() => { set("rentRange", opt); }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Step 4: Move-in cost ───────────────────────────── */}
                {step === 4 && (
                  <div>
                    <label className="block text-lg font-bold text-gray-900 mb-1">
                      What was your TOTAL move-in cost? (₦)
                    </label>
                    <p className="text-gray-400 text-sm mb-1">
                      Include rent + agency fee + caution + service charge + all other fees
                    </p>
                    <p className="text-[#F59E0B] text-xs font-medium mb-5">Optional — but very valuable</p>
                    <div className="space-y-2.5">
                      {COST_RANGES.map((opt) => (
                        <RadioCard
                          key={opt}
                          label={opt}
                          selected={formData.totalCostRange === opt}
                          onSelect={() => { set("totalCostRange", opt); }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Step 5: Email ──────────────────────────────────── */}
                {step === 5 && (
                  <div>
                    <label className="block text-lg font-bold text-gray-900 mb-1">
                      Get FREE early access to RentInDex
                    </label>
                    <p className="text-gray-400 text-sm mb-5">
                      Optional — leave blank to submit anonymously
                    </p>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => set("email", e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="your@email.com"
                      autoFocus
                      className="w-full px-4 py-3.5 rounded-xl border-2 border-gray-200 focus:outline-none focus:border-[#1B4332] text-gray-900 placeholder:text-gray-400 text-sm transition-all"
                    />

                    {error && <p className="text-red-500 text-sm mt-3">{error}</p>}

                    <button
                      onClick={submit}
                      disabled={submitting}
                      className="w-full mt-6 bg-[#F59E0B] hover:bg-[#D97706] disabled:opacity-60 text-white font-bold py-4 rounded-xl transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 flex items-center justify-center gap-2 text-base"
                    >
                      {submitting ? (
                        <>
                          <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                          Submitting...
                        </>
                      ) : (
                        "Submit My Rent Data 🚀"
                      )}
                    </button>

                    <p className="text-center text-xs text-gray-400 mt-3">
                      Your data is completely anonymous unless you provide your email.
                    </p>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Navigation */}
          {step < 5 && (
            <div className="flex items-center justify-between mt-8">
              {step > 0 ? (
                <button
                  onClick={back}
                  className="text-gray-400 hover:text-gray-700 text-sm font-medium transition-colors flex items-center gap-1"
                >
                  ← Back
                </button>
              ) : (
                <div />
              )}
              <button
                onClick={next}
                disabled={!canProceed()}
                className="bg-[#1B4332] hover:bg-[#2D6A4F] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold px-8 py-3 rounded-xl transition-all duration-200 hover:shadow-md text-sm"
              >
                {step === 4 ? "Last step →" : "Next →"}
              </button>
            </div>
          )}

          {step < 5 && step > 0 && (
            <p className="text-center text-xs text-gray-400 mt-4">
              Press <kbd className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">Enter</kbd> to continue
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
