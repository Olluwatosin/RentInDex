"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

// ─── data ────────────────────────────────────────────────────────────────────

const HERO_STATS = [
  { value: 142, suffix: "+", label: "Renters Surveyed" },
  { value: 15, suffix: "", label: "States Covered" },
  { value: 76, suffix: "", label: "Cities Represented" },
  { value: 93, suffix: "%", label: "Signed Lease 2025–26" },
];

const FEE_CARDS = [
  { icon: "⚖️", pct: 82, label: "Paid agency / lawyer fees" },
  { icon: "🔍", pct: 73, label: "Also paid a finder's fee" },
  { icon: "🔒", pct: 60, label: "Paid caution / security deposit" },
  { icon: "🏢", pct: 42, label: "Paid service charge on top" },
];

const TOP_STATES = [
  { state: "Ekiti", pct: 28 },
  { state: "FCT Abuja", pct: 25 },
  { state: "Lagos", pct: 10 },
  { state: "Kaduna", pct: 8 },
  { state: "Oyo", pct: 7 },
];

const RENT_RANGES = [
  { range: "< ₦150k", pct: 8, highlight: false },
  { range: "₦150k–₦300k", pct: 24, highlight: false },
  { range: "₦300k–₦600k", pct: 28, highlight: true },
  { range: "₦600k–₦1M", pct: 18, highlight: false },
  { range: "₦1M–₦2M", pct: 11, highlight: false },
  { range: "> ₦2M", pct: 9, highlight: false },
];

const STAR_RATINGS = [
  { stars: 1, pct: 16, label: "Very poor" },
  { stars: 2, pct: 21, label: "Poor" },
  { stars: 3, pct: 41, label: "Average" },
  { stars: 4, pct: 15, label: "Good" },
  { stars: 5, pct: 6, label: "Excellent" },
];

// ─── count-up hook ────────────────────────────────────────────────────────────

function useCountUp(target: number, duration = 1800, active = false) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!active) return;
    let start: number | null = null;
    const step = (ts: number) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      // ease-out
      setCount(Math.floor((1 - Math.pow(1 - progress, 3)) * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [active, target, duration]);
  return count;
}

// ─── sub-components ──────────────────────────────────────────────────────────

function StatCounter({
  value,
  suffix,
  label,
  active,
  delay,
}: {
  value: number;
  suffix: string;
  label: string;
  active: boolean;
  delay: number;
}) {
  const count = useCountUp(value, 1800, active);
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={active ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay }}
      className="flex flex-col items-center text-center px-4"
    >
      <span className="text-4xl sm:text-5xl font-extrabold text-[#F59E0B] tabular-nums">
        {count}
        {suffix}
      </span>
      <span className="mt-2 text-sm sm:text-base text-white/70 font-medium">{label}</span>
    </motion.div>
  );
}

function FeeCard({
  icon,
  pct,
  label,
  active,
  delay,
}: {
  icon: string;
  pct: number;
  label: string;
  active: boolean;
  delay: number;
}) {
  const count = useCountUp(pct, 1600, active);
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={active ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay }}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col items-center text-center hover:shadow-md transition-shadow"
    >
      <span className="text-3xl mb-4">{icon}</span>
      <span className="text-5xl font-extrabold text-[#1B4332] tabular-nums leading-none">
        {count}%
      </span>
      <p className="mt-3 text-sm text-gray-500 leading-snug">{label}</p>
    </motion.div>
  );
}

// custom tooltip for rent bar chart
function RentTooltip({ active, payload }: { active?: boolean; payload?: { payload: { range: string; pct: number; highlight: boolean } }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-2 shadow-lg text-sm">
      <p className="font-semibold text-gray-900">{d.range}</p>
      <p className="text-[#1B4332] font-bold">{d.pct}% of renters</p>
      {d.highlight && <p className="text-[#F59E0B] text-xs font-medium mt-0.5">Most common range ✦</p>}
    </div>
  );
}

// ─── main export ─────────────────────────────────────────────────────────────

export default function DataInsights() {
  const [responseCount, setResponseCount] = useState(142);

  useEffect(() => {
    fetch("/api/response-count")
      .then((res) => res.json())
      .then((data) => {
        if (typeof data.count === "number" && data.count > 0) {
          setResponseCount(data.count);
        }
      })
      .catch(() => setResponseCount(142));
  }, []);

  const statsRef = useRef(null);
  const feesRef = useRef(null);
  const statesRef = useRef(null);
  const rentRef = useRef(null);
  const ratingRef = useRef(null);

  const statsInView = useInView(statsRef, { once: true, margin: "0px 0px -100px 0px" });
  const feesInView = useInView(feesRef, { once: true, margin: "0px 0px -100px 0px" });
  const statesInView = useInView(statesRef, { once: true, margin: "0px 0px -100px 0px" });
  const rentInView = useInView(rentRef, { once: true, margin: "0px 0px -100px 0px" });
  const ratingInView = useInView(ratingRef, { once: true, margin: "0px 0px -100px 0px" });

  return (
    <section className="bg-gray-50">
      {/* ── 1. Stats bar ─────────────────────────────────────────────────── */}
      <div ref={statsRef} className="bg-[#1B4332] py-14 sm:py-16">
        <div className="max-w-6xl mx-auto px-6">
          <motion.p
            initial={{ opacity: 0 }}
            animate={statsInView ? { opacity: 1 } : {}}
            transition={{ duration: 0.4 }}
            className="text-center text-white/50 text-xs uppercase tracking-widest font-semibold mb-10"
          >
            RentInDex By The Numbers
          </motion.p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 divide-x-0 md:divide-x divide-white/10">
            {HERO_STATS.map((s, i) => (
              <StatCounter
                key={i}
                value={i === 0 ? responseCount : s.value}
                suffix={s.suffix}
                label={s.label}
                active={statsInView}
                delay={i * 0.1}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── 2. Fee cards ─────────────────────────────────────────────────── */}
      <div ref={feesRef} className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={feesInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
            className="text-center mb-12"
          >
            <span className="inline-block text-[#F59E0B] font-semibold text-xs uppercase tracking-widest mb-3">
              The Real Cost of Renting
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900">
              You don&apos;t just pay rent.
            </h2>
            <p className="mt-3 text-gray-500 text-lg max-w-xl mx-auto">
              Most renters are hit with multiple fees on top of their annual rent — often without knowing upfront.
            </p>
          </motion.div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {FEE_CARDS.map((c, i) => (
              <FeeCard
                key={i}
                icon={c.icon}
                pct={c.pct}
                label={c.label}
                active={feesInView}
                delay={i * 0.1}
              />
            ))}
          </div>

          {/* Shocking callout */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={feesInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="mt-8 bg-amber-50 border border-amber-200 rounded-2xl px-6 py-5 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left"
          >
            <span className="text-3xl">💡</span>
            <p className="text-gray-700 text-sm leading-relaxed">
              <strong className="text-gray-900">Only 1.4% of renters</strong> found their house through a property website.{" "}
              <strong className="text-gray-900">55% relied on a real estate agent</strong> — the very person charging the fees.
            </p>
          </motion.div>
        </div>
      </div>

      {/* ── 3. Top states ────────────────────────────────────────────────── */}
      <div ref={statesRef} className="py-20 px-6 bg-white">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={statesInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
            className="mb-12"
          >
            <span className="inline-block text-[#F59E0B] font-semibold text-xs uppercase tracking-widest mb-3">
              Where Nigerians Are Renting
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900">
              Top 5 states in our survey
            </h2>
            <p className="mt-3 text-gray-500">
              Data from renters across 15 states — Abuja and Ekiti lead the way.
            </p>
          </motion.div>

          <div className="space-y-5">
            {TOP_STATES.map((s, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={statesInView ? { opacity: 1, x: 0 } : {}}
                transition={{ duration: 0.5, delay: i * 0.08 }}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-semibold text-gray-800 text-sm">{s.state}</span>
                  <span className="text-[#1B4332] font-bold text-sm">{s.pct}%</span>
                </div>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={statesInView ? { width: `${(s.pct / 28) * 100}%` } : {}}
                    transition={{ duration: 1, delay: i * 0.08 + 0.2, ease: "easeOut" }}
                    className="h-full rounded-full bg-[#1B4332]"
                  />
                </div>
              </motion.div>
            ))}
          </div>

          {/* Landlord pipeline callout */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={statesInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.6 }}
            className="mt-10 grid grid-cols-3 gap-4"
          >
            {[
              { n: "11", label: "Landlords ready to list" },
              { n: "40", label: "Know interested landlords" },
              { n: "51", label: "Total landlord connections" },
            ].map((item, i) => (
              <div key={i} className="bg-[#1B4332]/5 rounded-2xl p-5 text-center">
                <p className="text-3xl font-extrabold text-[#1B4332]">{item.n}</p>
                <p className="text-xs text-gray-500 mt-1 leading-snug">{item.label}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* ── 4. Rent range bar chart ───────────────────────────────────────── */}
      <div ref={rentRef} className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={rentInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
            className="mb-10"
          >
            <span className="inline-block text-[#F59E0B] font-semibold text-xs uppercase tracking-widest mb-3">
              What Renters Pay
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900">
              Annual rent distribution
            </h2>
            <p className="mt-3 text-gray-500">
              ₦300k–₦600k is the most common range — but hidden fees push true costs far higher.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={rentInView ? { opacity: 1 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6"
          >
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={RENT_RANGES}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                barCategoryGap="30%"
              >
                <XAxis
                  dataKey="range"
                  tick={{ fontSize: 11, fill: "#9CA3AF" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 11, fill: "#9CA3AF" }}
                  axisLine={false}
                  tickLine={false}
                  domain={[0, 35]}
                />
                <Tooltip content={<RentTooltip />} cursor={{ fill: "rgba(27,67,50,0.04)" }} />
                <Bar dataKey="pct" radius={[6, 6, 0, 0]}>
                  {RENT_RANGES.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.highlight ? "#F59E0B" : "#1B4332"}
                      fillOpacity={entry.highlight ? 1 : 0.7}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex items-center justify-center gap-5 mt-4 text-xs text-gray-500">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-[#1B4332]/70 inline-block" />
                Rent range
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-[#F59E0B] inline-block" />
                Sweet spot ✦ Most common
              </span>
            </div>
          </motion.div>

          {/* Property types */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={rentInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3"
          >
            {[
              { type: "2-bed flat", pct: "33%" },
              { type: "Self-contained", pct: "24%" },
              { type: "1-bed flat", pct: "20%" },
              { type: "3-bed flat", pct: "9%" },
            ].map((p, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 text-center">
                <p className="text-2xl font-extrabold text-[#1B4332]">{p.pct}</p>
                <p className="text-xs text-gray-500 mt-1">{p.type}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* ── 5. Value-for-money crisis ─────────────────────────────────────── */}
      <div ref={ratingRef} className="py-20 px-6 bg-white">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={ratingInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
            className="mb-10"
          >
            <span className="inline-block text-[#F59E0B] font-semibold text-xs uppercase tracking-widest mb-3">
              Value For Money Crisis
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900">
              How renters rate their value
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-10 items-center">
            {/* Bar ratings */}
            <div className="space-y-4">
              {STAR_RATINGS.map((r, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -16 }}
                  animate={ratingInView ? { opacity: 1, x: 0 } : {}}
                  transition={{ duration: 0.45, delay: i * 0.07 }}
                >
                  <div className="flex items-center gap-3 mb-1">
                    <div className="flex gap-0.5">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <svg
                          key={j}
                          className={`w-4 h-4 ${j < r.stars ? "text-[#F59E0B]" : "text-gray-200"}`}
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      ))}
                    </div>
                    <span className="text-xs text-gray-500 flex-1">{r.label}</span>
                    <span className="font-bold text-sm text-gray-800">{r.pct}%</span>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={ratingInView ? { width: `${r.pct}%` } : {}}
                      transition={{ duration: 0.9, delay: i * 0.07 + 0.2, ease: "easeOut" }}
                      className={`h-full rounded-full ${
                        r.stars <= 2 ? "bg-red-400" : r.stars === 3 ? "bg-amber-400" : "bg-[#1B4332]"
                      }`}
                    />
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Big callout */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={ratingInView ? { opacity: 1, scale: 1 } : {}}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="bg-red-50 border border-red-100 rounded-3xl p-8 text-center"
            >
              <span className="text-5xl">😤</span>
              <p className="mt-4 text-6xl font-extrabold text-red-500 tabular-nums">37%</p>
              <p className="mt-3 text-gray-700 font-semibold text-lg leading-snug">
                of renters feel they get <span className="text-red-500">poor value for money</span>
              </p>
              <p className="mt-3 text-gray-400 text-sm">
                Combined 1 &amp; 2-star responses from 142+ surveyed renters
              </p>
              <div className="mt-6 pt-6 border-t border-red-100">
                <p className="text-gray-600 text-sm">
                  RentInDex exists to fix this. <br />
                  <strong className="text-[#1B4332]">Know the fair price before you sign.</strong>
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
