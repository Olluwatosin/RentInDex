"use client";

import { useState } from "react";

// Know Your Rights — the Lagos Tenancy Law 2011, answered for one renter's
// situation.
//
// Designed for a phone on metered data and for WhatsApp. The unit of value is
// not the page, it is the answer card: a quoted section a renter can screenshot
// into a family group or show to a landlord. Everything here serves that —
// short flow, big targets, and a result that reads as a self-contained document
// with the citation on its face.

type Situation = "increase" | "notice" | "advance_rent" | "eviction";

interface Citation {
  law: string;
  section: string;
  quote: string;
  url: string;
}

interface Finding {
  verdict: "lawful" | "unlawful" | "depends" | "info";
  headline: string;
  detail: string[];
  citations: Citation[];
  actions?: string[];
}

interface Answer {
  supported: boolean;
  message?: string;
  coveredByLaw?: boolean;
  excludedArea?: string | null;
  findings?: Finding[];
  pendingReform?: { status: string; proposals: string[]; warning: string };
  disclaimer?: string;
}

const SITUATIONS: { key: Situation; icon: string; title: string; sub: string }[] = [
  {
    key: "increase",
    icon: "📈",
    title: "My rent is going up",
    sub: "Find out what the law lets you do about it",
  },
  {
    key: "advance_rent",
    icon: "💰",
    title: "They want years upfront",
    sub: "There is a legal limit, and most people don't know it",
  },
  {
    key: "notice",
    icon: "📄",
    title: "I got a quit notice",
    sub: "How much notice you are actually owed",
  },
  {
    key: "eviction",
    icon: "🚨",
    title: "I'm locked out or threatened",
    sub: "This is a criminal offence, not a disagreement",
  },
];

const TENANCY_TYPES = [
  { key: "monthly", label: "Monthly" },
  { key: "quarterly", label: "Quarterly" },
  { key: "half_yearly", label: "Every 6 months" },
  { key: "yearly", label: "Yearly" },
  { key: "fixed_term", label: "Fixed term that expired" },
];

const VERDICT_STYLE: Record<Finding["verdict"], { chip: string; label: string; bar: string }> = {
  unlawful: { chip: "bg-red-100 text-red-800", label: "Against the law", bar: "bg-red-500" },
  lawful: { chip: "bg-emerald-100 text-emerald-800", label: "Within the law", bar: "bg-emerald-500" },
  depends: { chip: "bg-amber-100 text-amber-900", label: "You have a route", bar: "bg-amber-500" },
  info: { chip: "bg-slate-100 text-slate-700", label: "Know this", bar: "bg-slate-400" },
};

const formatDigits = (raw: string) => {
  const d = raw.replace(/[^\d]/g, "");
  return d ? Number(d).toLocaleString("en-NG") : "";
};
const toNumber = (s: string) => Number(s.replace(/[^\d]/g, "")) || 0;

export default function RightsChecker() {
  const [situation, setSituation] = useState<Situation | null>(null);
  const [area, setArea] = useState("");
  const [tenancyType, setTenancyType] = useState("yearly");
  const [agreementStatesPeriod, setAgreementStatesPeriod] = useState(false);
  const [isSittingTenant, setIsSittingTenant] = useState(false);
  const [monthsDemanded, setMonthsDemanded] = useState("24");
  const [currentRent, setCurrentRent] = useState("");
  const [proposedRent, setProposedRent] = useState("");
  const [harassment, setHarassment] = useState<Record<string, boolean>>({});
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);

  const reset = () => {
    setAnswer(null);
    setSituation(null);
  };

  async function submit() {
    if (!situation) return;
    setLoading(true);
    try {
      const res = await fetch("/api/tenancy/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          state: "Lagos",
          area: area.trim() || null,
          tenancyType,
          questions: [situation],
          agreementStatesPeriod,
          isSittingTenant,
          monthsDemanded: toNumber(monthsDemanded),
          currentRent: toNumber(currentRent),
          proposedRent: toNumber(proposedRent),
          ...harassment,
        }),
      });
      setAnswer(await res.json());
    } catch {
      setAnswer({
        supported: true,
        findings: [
          {
            verdict: "info",
            headline: "Couldn't check that just now.",
            detail: ["Check your connection and try again."],
            citations: [],
          },
        ],
      });
    } finally {
      setLoading(false);
    }
  }

  // What gets forwarded. The section and its wording lead, because that is the
  // part that carries weight in an argument with a landlord.
  function shareText(f: Finding): string {
    const c = f.citations[0];
    return [
      `⚖️ ${f.headline}`,
      c ? `\n${c.law}, ${c.section}:\n"${c.quote}"` : "",
      f.actions?.length ? `\nWhat to do: ${f.actions[0]}` : "",
      `\nCheck your own situation 👉 rentindex.com.ng/rights`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  async function share(f: Finding, i: number) {
    const text = shareText(f);
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        /* cancelled — fall through to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(i);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* clipboard blocked; nothing useful to do */
    }
  }

  const needsDetails = situation !== null;

  return (
    <main className="min-h-screen bg-[#1B4332] text-white">
      <div className="mx-auto w-full max-w-2xl px-5 py-10 sm:py-14">
        {/* Header */}
        <a href="/" className="inline-flex items-center gap-2 text-white/70 hover:text-white text-sm mb-8">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/10 text-xs font-bold">R</span>
          RentInDex
        </a>

        <h1 className="text-3xl sm:text-4xl font-extrabold leading-tight tracking-tight">
          Know your rights as a Lagos tenant
        </h1>
        <p className="mt-3 text-white/70 leading-relaxed">
          Straight from the Lagos State Tenancy Law 2011 — with the section quoted, so you can
          show it to anyone.
        </p>

        {/* ── Step 1: the situation ── */}
        {!answer && (
          <div className="mt-8 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/50">
              What is happening?
            </p>
            {SITUATIONS.map((s) => {
              const active = situation === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => setSituation(active ? null : s.key)}
                  aria-pressed={active}
                  className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition ${
                    active
                      ? "border-[#F59E0B] bg-white/10"
                      : "border-white/15 bg-white/[0.04] hover:bg-white/[0.08]"
                  }`}
                >
                  <span className="text-xl leading-none">{s.icon}</span>
                  <span>
                    <span className="block font-semibold">{s.title}</span>
                    <span className="block text-sm text-white/60">{s.sub}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* ── Step 2: the details ── */}
        {!answer && needsDetails && (
          <div className="mt-6 space-y-5 rounded-xl border border-white/15 bg-white/[0.04] p-5">
            <div>
              <label htmlFor="area" className="block text-sm font-medium">
                Which area of Lagos?
              </label>
              <p className="mt-1 text-xs text-white/50">
                Four areas are exempt from this law entirely — this checks yours.
              </p>
              <input
                id="area"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="e.g. Egbeda, Yaba, Ikorodu"
                className="mt-2 w-full rounded-lg border border-white/20 bg-[#123528] px-3 py-2.5 text-white placeholder-white/35 focus:border-[#F59E0B] focus:outline-none"
              />
            </div>

            {(situation === "notice" || situation === "advance_rent") && (
              <div>
                <label className="block text-sm font-medium">How often do you pay rent?</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {TENANCY_TYPES.map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setTenancyType(t.key)}
                      aria-pressed={tenancyType === t.key}
                      className={`rounded-full px-3.5 py-1.5 text-sm transition ${
                        tenancyType === t.key
                          ? "bg-[#F59E0B] font-semibold text-white"
                          : "bg-white/10 text-white/80 hover:bg-white/20"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {situation === "notice" && (
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={agreementStatesPeriod}
                  onChange={(e) => setAgreementStatesPeriod(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[#F59E0B]"
                />
                <span>
                  My tenancy agreement states a notice period
                  <span className="block text-white/50">
                    This matters more than most renters realise — an agreed period overrides the law&apos;s default.
                  </span>
                </span>
              </label>
            )}

            {situation === "advance_rent" && (
              <>
                <div>
                  <label htmlFor="months" className="block text-sm font-medium">
                    How many months are they asking for?
                  </label>
                  <input
                    id="months"
                    inputMode="numeric"
                    value={monthsDemanded}
                    onChange={(e) => setMonthsDemanded(e.target.value.replace(/[^\d]/g, ""))}
                    className="mt-2 w-28 rounded-lg border border-white/20 bg-[#123528] px-3 py-2.5 text-white focus:border-[#F59E0B] focus:outline-none"
                  />
                </div>
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={isSittingTenant}
                    onChange={(e) => setIsSittingTenant(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-[#F59E0B]"
                  />
                  <span>
                    I already live there (renewing)
                    <span className="block text-white/50">
                      Sitting tenants and new tenants have different limits.
                    </span>
                  </span>
                </label>
              </>
            )}

            {situation === "increase" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="cur" className="block text-sm font-medium">
                    Rent now (₦)
                  </label>
                  <input
                    id="cur"
                    inputMode="numeric"
                    value={currentRent}
                    onChange={(e) => setCurrentRent(formatDigits(e.target.value))}
                    placeholder="800,000"
                    className="mt-2 w-full rounded-lg border border-white/20 bg-[#123528] px-3 py-2.5 text-white placeholder-white/35 focus:border-[#F59E0B] focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="prop" className="block text-sm font-medium">
                    New rent (₦)
                  </label>
                  <input
                    id="prop"
                    inputMode="numeric"
                    value={proposedRent}
                    onChange={(e) => setProposedRent(formatDigits(e.target.value))}
                    placeholder="1,400,000"
                    className="mt-2 w-full rounded-lg border border-white/20 bg-[#123528] px-3 py-2.5 text-white placeholder-white/35 focus:border-[#F59E0B] focus:outline-none"
                  />
                </div>
              </div>
            )}

            {situation === "eviction" && (
              <div className="space-y-2">
                <p className="text-sm font-medium">What have they done?</p>
                {[
                  ["lockedOut", "Changed the locks or locked me out"],
                  ["propertyDamaged", "Removed the door or roof, or damaged the place"],
                  ["threatened", "Threatened me, or sent people to intimidate me"],
                  ["utilitiesCut", "Cut off the power or water"],
                  ["hasCourtOrder", "They say they have a court order"],
                ].map(([key, label]) => (
                  <label key={key} className="flex items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(harassment[key])}
                      onChange={(e) =>
                        setHarassment((h) => ({ ...h, [key]: e.target.checked }))
                      }
                      className="h-4 w-4 accent-[#F59E0B]"
                    />
                    {label}
                  </label>
                ))}
              </div>
            )}

            <button
              onClick={submit}
              disabled={loading}
              className="w-full rounded-full bg-[#F59E0B] px-6 py-3.5 font-bold text-white transition hover:bg-[#D97706] disabled:opacity-60"
            >
              {loading ? "Checking the law…" : "Check what the law says"}
            </button>
          </div>
        )}

        {/* ── Result ── */}
        {answer && (
          <div className="mt-8">
            {answer.supported === false ? (
              <div className="rounded-xl border border-white/15 bg-white/[0.04] p-5">
                <p className="leading-relaxed text-white/80">{answer.message}</p>
              </div>
            ) : (
              <>
                {answer.excludedArea && (
                  <div className="mb-5 rounded-xl border-l-4 border-amber-400 bg-amber-400/10 p-4">
                    <p className="text-sm font-semibold text-amber-200">
                      {answer.excludedArea} is exempt from this law
                    </p>
                    <p className="mt-1 text-sm text-white/70">
                      The answers below still tell you what the Tenancy Law says, but it does not
                      cover your address. Your tenancy agreement carries more weight here than
                      anywhere else in Lagos.
                    </p>
                  </div>
                )}

                <div className="space-y-4">
                  {answer.findings?.map((f, i) => {
                    const style = VERDICT_STYLE[f.verdict];
                    return (
                      <article
                        key={i}
                        className="overflow-hidden rounded-xl bg-white text-slate-900 shadow-lg"
                      >
                        <div className={`h-1 w-full ${style.bar}`} />
                        <div className="p-5">
                          <span
                            className={`inline-block rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${style.chip}`}
                          >
                            {style.label}
                          </span>
                          <h2 className="mt-2.5 text-lg font-bold leading-snug">{f.headline}</h2>

                          {f.detail.map((d, j) => (
                            <p key={j} className="mt-2.5 text-[15px] leading-relaxed text-slate-700">
                              {d}
                            </p>
                          ))}

                          {f.citations.map((c, j) => (
                            <figure
                              key={j}
                              className="mt-4 border-l-[3px] border-[#1B4332] bg-slate-50 py-3 pl-4 pr-3"
                            >
                              <blockquote className="font-serif text-[15px] leading-relaxed text-slate-800">
                                &ldquo;{c.quote}&rdquo;
                              </blockquote>
                              <figcaption className="mt-2 text-xs font-semibold text-[#1B4332]">
                                {c.law}, {c.section}
                                <a
                                  href={c.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="ml-2 font-normal text-slate-500 underline"
                                >
                                  read the gazette
                                </a>
                              </figcaption>
                            </figure>
                          ))}

                          {f.actions?.length ? (
                            <div className="mt-4 rounded-lg bg-[#1B4332]/5 p-4">
                              <p className="text-xs font-bold uppercase tracking-wider text-[#1B4332]">
                                What to do
                              </p>
                              <ul className="mt-2 space-y-1.5">
                                {f.actions.map((a, k) => (
                                  <li key={k} className="flex gap-2 text-[15px] text-slate-700">
                                    <span className="text-[#F59E0B]">→</span>
                                    <span>{a}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}

                          <button
                            onClick={() => share(f, i)}
                            className="mt-4 w-full rounded-full border-2 border-[#1B4332] py-2.5 text-sm font-bold text-[#1B4332] transition hover:bg-[#1B4332] hover:text-white"
                          >
                            {copied === i ? "Copied — paste it anywhere" : "Share this"}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>

                {/* The rent index is the evidence s.37 asks a court to weigh. */}
                {situation === "increase" && (
                  <div className="mt-5 rounded-xl border border-[#F59E0B]/40 bg-[#F59E0B]/10 p-5">
                    <p className="font-semibold">
                      The court&apos;s first question is what neighbours pay
                    </p>
                    <p className="mt-1.5 text-sm leading-relaxed text-white/75">
                      Section 37(2)(a) says a court weighs &ldquo;the general level of rents in the
                      locality&rdquo; before anything else. That is exactly what we collect. Ask
                      RentBot what your area actually pays, and take the answer with you.
                    </p>
                    <button
                      onClick={() =>
                        window.dispatchEvent(
                          new CustomEvent("open-rentbot", {
                            detail: {
                              prompt: area
                                ? `What is the average rent in ${area}?`
                                : "What is the average rent in my area?",
                            },
                          })
                        )
                      }
                      className="mt-3 rounded-full bg-[#F59E0B] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#D97706]"
                    >
                      Find what my area pays
                    </button>
                  </div>
                )}

                {answer.pendingReform && (
                  <details className="mt-5 rounded-xl border border-white/15 bg-white/[0.04] p-5">
                    <summary className="cursor-pointer font-semibold">
                      What about the new Lagos tenancy bill?
                    </summary>
                    <p className="mt-3 text-sm font-medium text-amber-200">
                      {answer.pendingReform.warning}
                    </p>
                    <p className="mt-2 text-sm text-white/60">{answer.pendingReform.status}</p>
                    <ul className="mt-3 space-y-1.5 text-sm text-white/75">
                      {answer.pendingReform.proposals.map((p, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-white/35">•</span>
                          {p}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                {answer.disclaimer && (
                  <p className="mt-5 text-xs leading-relaxed text-white/45">{answer.disclaimer}</p>
                )}
              </>
            )}

            <button
              onClick={reset}
              className="mt-6 text-sm text-white/60 underline hover:text-white"
            >
              Check something else
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
