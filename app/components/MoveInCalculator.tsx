"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import type { FeeKey, FeeStat } from "@/app/lib/fees";

const FEE_ORDER: FeeKey[] = ["agency", "finder", "caution", "service"];

const naira = (n: number) => "₦" + Math.round(n).toLocaleString("en-NG");

// Compact form for the headline figure: ₦1.2m, ₦850k.
function nairaShort(n: number): string {
  if (n >= 1_000_000) return "₦" + (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 2).replace(/\.?0+$/, "") + "m";
  if (n >= 1_000) return "₦" + Math.round(n / 1_000) + "k";
  return naira(n);
}

// Keep only digits, then group them: "1200000" -> "1,200,000".
function formatDigits(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "");
  return digits ? Number(digits).toLocaleString("en-NG") : "";
}

interface FeeState {
  enabled: boolean;
  pct: number;
}

export default function MoveInCalculator() {
  const params = useSearchParams();
  const [stats, setStats] = useState<FeeStat[] | null>(null);
  const [sampleSize, setSampleSize] = useState<number | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  // Rent is held as a display string with thousand separators — "1200000" is
  // genuinely hard to read at a glance, and misreading it by a digit is exactly
  // the mistake this page exists to prevent.
  const [rent, setRent] = useState(() => formatDigits(params.get("rent") ?? ""));
  const [fees, setFees] = useState<Record<string, FeeState>>({});
  const [copied, setCopied] = useState(false);

  // Defaults come from the survey, not from us: a fee is pre-ticked when most
  // renters reported paying it, at the median percentage they reported.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/move-in-cost")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { fees: FeeStat[]; sampleSize: number }) => {
        if (cancelled) return;
        setStats(data.fees);
        setSampleSize(data.sampleSize);
        setFees((prev) => {
          const next: Record<string, FeeState> = {};
          for (const f of data.fees) {
            const fromUrl = params.get(f.key);
            next[f.key] = prev[f.key] ?? {
              enabled: fromUrl != null ? Number(fromUrl) > 0 : f.paidPct >= 50,
              pct: fromUrl != null ? Number(fromUrl) : f.medianPct ?? 0,
            };
          }
          return next;
        });
      })
      .catch(() => !cancelled && setLoadFailed(true));
    return () => {
      cancelled = true;
    };
    // params is read once, for the initial shared-link state only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rentValue = Math.max(0, Number(rent.replace(/[^\d.]/g, "")) || 0);

  const lines = useMemo(() => {
    if (!stats) return [];
    return FEE_ORDER.map((key) => {
      const stat = stats.find((s) => s.key === key);
      const state = fees[key];
      if (!stat || !state) return null;
      return {
        stat,
        state,
        amount: state.enabled ? (rentValue * state.pct) / 100 : 0,
      };
    }).filter(Boolean) as { stat: FeeStat; state: FeeState; amount: number }[];
  }, [stats, fees, rentValue]);

  const extras = lines.reduce((sum, l) => sum + l.amount, 0);
  const total = rentValue + extras;
  const extraPct = rentValue > 0 ? Math.round((extras / rentValue) * 100) : 0;

  const setFee = (key: string, patch: Partial<FeeState>) =>
    setFees((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const share = async () => {
    const q = new URLSearchParams();
    if (rentValue > 0) q.set("rent", String(rentValue));
    for (const key of FEE_ORDER) {
      const f = fees[key];
      if (f) q.set(key, String(f.enabled ? f.pct : 0));
    }
    const url = `${window.location.origin}/calculator?${q.toString()}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      window.prompt("Copy this link:", url);
    }
  };

  const openRentBot = () => window.dispatchEvent(new Event("open-rentbot"));

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-950 to-[#06140f]">
      <div className="max-w-3xl mx-auto px-5 sm:px-8 py-10 sm:py-16">
        <a href="/" className="inline-flex items-center gap-2 text-white/40 hover:text-white/70 text-sm transition-colors">
          <span aria-hidden>←</span> RentInDex
        </a>

        <header className="mt-8 mb-10">
          <span className="inline-block text-gold-500 font-semibold text-xs uppercase tracking-widest mb-3">
            Budget Planner
          </span>
          <h1 className="text-3xl sm:text-5xl font-extrabold text-white leading-tight">
            What will moving in <span className="text-green-500">actually</span> cost?
          </h1>
          <p className="mt-4 text-white/50 text-base sm:text-lg leading-relaxed">
            The advertised rent is never the number you pay. Enter the yearly rent and
            we&apos;ll add the fees Nigerian renters actually reported
            {sampleSize ? ` — from ${sampleSize} renter reports` : ""}.
          </p>
        </header>

        {/* ── rent input ─────────────────────────────────────────── */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 sm:p-6 mb-5">
          <label htmlFor="rent" className="block text-white/60 text-sm font-medium mb-3">
            Yearly rent being asked
          </label>
          <div className="flex items-center gap-3">
            <span className="text-2xl sm:text-3xl font-bold text-white/30">₦</span>
            <input
              id="rent"
              type="text"
              inputMode="numeric"
              value={rent}
              onChange={(e) => setRent(formatDigits(e.target.value))}
              placeholder="1,200,000"
              className="w-full bg-transparent text-2xl sm:text-3xl font-bold text-white placeholder:text-white/20 focus:outline-none"
            />
          </div>
          <button
            onClick={openRentBot}
            className="mt-4 text-sm text-green-500 hover:text-green-400 font-medium transition-colors"
          >
            Not sure what&apos;s fair for your area? Ask RentBot →
          </button>
        </div>

        {/* ── fee lines ──────────────────────────────────────────── */}
        {loadFailed ? (
          <p className="bg-white/5 border border-white/10 rounded-2xl p-6 text-white/50 text-sm">
            Couldn&apos;t load the fee benchmarks just now. Please refresh — we&apos;d rather show
            you nothing than made-up percentages.
          </p>
        ) : !stats ? (
          <div className="space-y-3">
            {FEE_ORDER.map((k) => (
              <div key={k} className="h-[86px] bg-white/5 border border-white/10 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {lines.map(({ stat, state, amount }) => (
              <div
                key={stat.key}
                className={`border rounded-2xl p-5 transition-colors ${
                  state.enabled ? "bg-white/5 border-white/15" : "bg-transparent border-white/5"
                }`}
              >
                <div className="flex items-start gap-4">
                  <button
                    role="switch"
                    aria-checked={state.enabled}
                    aria-label={`Include ${stat.label}`}
                    onClick={() => setFee(stat.key, { enabled: !state.enabled })}
                    className={`mt-0.5 shrink-0 w-11 h-6 rounded-full p-0.5 transition-colors ${
                      state.enabled ? "bg-green-600" : "bg-white/15"
                    }`}
                  >
                    <span
                      className={`block w-5 h-5 rounded-full bg-white transition-transform ${
                        state.enabled ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-3 flex-wrap">
                      <span className={`font-semibold ${state.enabled ? "text-white" : "text-white/40"}`}>
                        {stat.label}
                      </span>
                      <span className={`font-bold tabular-nums ${state.enabled ? "text-white" : "text-white/25"}`}>
                        {amount > 0 ? naira(amount) : "—"}
                      </span>
                    </div>

                    <p className="text-white/40 text-xs mt-1.5 leading-relaxed">
                      <span className="text-gold-500 font-semibold">{stat.paidPct}%</span> of{" "}
                      {stat.answered} renters paid this
                      {stat.medianPct != null && <> · typically {stat.medianPct}% of rent</>}
                      {stat.modePct != null && stat.modePct !== stat.medianPct && (
                        <> · most common {stat.modePct}%</>
                      )}
                      {stat.fixedCount >= 10 && stat.medianFixed != null && (
                        <> · {stat.fixedCount} paid a flat fee instead, typically {naira(stat.medianFixed)}</>
                      )}
                    </p>

                    {state.enabled && (
                      <div className="flex items-center gap-2 mt-3">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          value={state.pct}
                          onChange={(e) => setFee(stat.key, { pct: Math.max(0, Number(e.target.value) || 0) })}
                          aria-label={`${stat.label} percentage of rent`}
                          className="w-20 bg-white/10 border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm font-semibold focus:outline-none focus:border-green-600"
                        />
                        <span className="text-white/40 text-sm">% of annual rent</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── total ──────────────────────────────────────────────── */}
        <motion.div
          layout
          className="mt-6 rounded-2xl p-6 sm:p-8 bg-gradient-to-br from-green-900 to-green-800 border border-green-700/40"
        >
          <p className="text-white/50 text-sm font-medium mb-2">You need on day one</p>
          <p className="text-4xl sm:text-6xl font-extrabold text-white tabular-nums leading-none">
            {rentValue > 0 ? nairaShort(total) : "₦—"}
          </p>

          {rentValue > 0 && (
            <>
              <p className="text-white/60 mt-3 text-sm sm:text-base">
                {naira(total)} in full — that&apos;s{" "}
                <span className="text-gold-400 font-bold">{naira(extras)}</span> on top of the rent
                {extraPct > 0 && <> ({extraPct}% extra)</>}.
              </p>
              <div className="mt-6 pt-5 border-t border-white/10 space-y-2 text-sm">
                <div className="flex justify-between text-white/70">
                  <span>Annual rent</span>
                  <span className="tabular-nums">{naira(rentValue)}</span>
                </div>
                {lines
                  .filter((l) => l.amount > 0)
                  .map((l) => (
                    <div key={l.stat.key} className="flex justify-between text-white/50">
                      <span>
                        {l.stat.label} <span className="text-white/30">({l.state.pct}%)</span>
                      </span>
                      <span className="tabular-nums">{naira(l.amount)}</span>
                    </div>
                  ))}
                <div className="flex justify-between text-white font-bold pt-2 border-t border-white/10">
                  <span>Total</span>
                  <span className="tabular-nums">{naira(total)}</span>
                </div>
              </div>
            </>
          )}
        </motion.div>

        {rentValue > 0 && (
          <div className="flex flex-col sm:flex-row gap-3 mt-5">
            <button
              onClick={share}
              className="flex-1 bg-white text-green-900 font-semibold rounded-xl px-5 py-3.5 hover:bg-white/90 transition-colors"
            >
              {copied ? "Link copied ✓" : "Copy shareable link"}
            </button>
            <button
              onClick={openRentBot}
              className="flex-1 border border-white/15 text-white font-semibold rounded-xl px-5 py-3.5 hover:bg-white/5 transition-colors"
            >
              Add what you actually paid
            </button>
          </div>
        )}

        <p className="text-white/25 text-xs leading-relaxed mt-10">
          Percentages are the median reported by Nigerian renters in our survey, applied to the
          rent you entered — an estimate to budget against, not a quote. The survey asked about
          agency and lawyer fees as one question, so those are combined. Service charge is usually
          recurring rather than a one-off. Fees are shown nationwide: rent varies sharply by area,
          but fee conventions are far more uniform, and no single state has enough responses yet to
          break these out honestly.
        </p>
      </div>
    </div>
  );
}
