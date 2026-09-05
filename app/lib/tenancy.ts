// Nigerian tenancy law — the rules engine.
//
// Deliberately pure: no React, no Next, no database. The web UI, the API route
// and (next) the WhatsApp bot all call these same functions, so the answer a
// renter gets is identical whichever door they came through.
//
// Two rules govern everything in this file:
//
//   1. Every answer carries its citation. We quote the section and its actual
//      wording, because "a website said so" is worth nothing in a dispute with
//      a landlord and a quoted statute is worth a great deal.
//   2. We never state law we have not read. Only Lagos is encoded here, from
//      the Tenancy Law 2011 as published in the Lagos State Official Gazette
//      No 37, Vol 44, 26 August 2011. Other states have their own Recovery of
//      Premises laws which are NOT the same, and inventing them would be the
//      exact failure this project exists to correct.

export type TenancyType =
  | "at_will"
  | "monthly"
  | "quarterly"
  | "half_yearly"
  | "yearly"
  | "fixed_term";

export type Verdict = "lawful" | "unlawful" | "depends" | "info";

export interface Citation {
  law: string;
  section: string;
  quote: string;
  url: string;
}

export interface Finding {
  verdict: Verdict;
  headline: string;
  /** Plain-language explanation. Written for a renter, not a lawyer. */
  detail: string[];
  citations: Citation[];
  /** What the renter should actually do next. */
  actions?: string[];
}

const GAZETTE_URL =
  "http://lagosministryofjustice.org/wp-content/uploads/2022/01/Tenancy-Law-2011.pdf";

const LAW = "Lagos State Tenancy Law 2011";

const cite = (section: string, quote: string): Citation => ({
  law: LAW,
  section,
  quote,
  url: GAZETTE_URL,
});

// ─── coverage ────────────────────────────────────────────────────────────────
//
// s.1(3) exempts four of the most expensive addresses in Nigeria. A renter in
// Ikoyi and a renter in Ikorodu are not under the same law, which is the single
// most surprising fact in the statute and the first thing the tool must
// establish — every other answer depends on it.

export const EXCLUDED_AREAS = ["Apapa", "Ikeja GRA", "Ikoyi", "Victoria Island"];

const EXCLUDED_PATTERNS: [RegExp, string][] = [
  [/\bapapa\b/i, "Apapa"],
  [/\bikeja\s*g\.?r\.?a\.?\b/i, "Ikeja GRA"],
  [/\bikoyi\b/i, "Ikoyi"],
  [/\b(victoria\s*island|\bv\.?i\.?\b)\b/i, "Victoria Island"],
];

export interface Coverage {
  covered: boolean;
  matchedArea: string | null;
  finding: Finding;
}

/** Is this Lagos address inside the 2011 Law, or in an exempted area? */
export function checkCoverage(area: string | null): Coverage {
  const matched = area
    ? EXCLUDED_PATTERNS.find(([re]) => re.test(area))?.[1] ?? null
    : null;

  if (matched) {
    return {
      covered: false,
      matchedArea: matched,
      finding: {
        verdict: "info",
        headline: `${matched} is exempt from the Lagos Tenancy Law 2011.`,
        detail: [
          `The Law expressly does not apply to Apapa, Ikeja GRA, Ikoyi or Victoria Island. Tenancies there fall under the older Rent Control and Recovery of Residential Premises Law instead, and the protections below — the advance-rent limit, the notice periods, the unreasonable-increase application — do not apply to you in the same way.`,
          `This is not a technicality. It means the four most expensive addresses in Lagos carry the weakest statutory tenant protection in the state.`,
        ],
        citations: [
          cite(
            "s.1(3)",
            "The following areas: (i) Apapa: (ii) Ikeja GRA.; (iii) Ikoyi; and (iv) Victoria Island are exempted from the application of this Law"
          ),
        ],
        actions: [
          "Get your tenancy agreement — in an exempt area its terms carry more weight than anywhere else in Lagos.",
          "Speak to a lawyer before agreeing to any increase or notice; the default protections you may have read about elsewhere do not cover you.",
        ],
      },
    };
  }

  return {
    covered: true,
    matchedArea: null,
    finding: {
      verdict: "info",
      headline: "The Lagos Tenancy Law 2011 covers you.",
      detail: [
        "The Law applies to all premises in Lagos State, residential and business, apart from four exempted areas and a few special categories such as student and hospital accommodation.",
      ],
      citations: [
        cite(
          "s.1(1)",
          "This Law shall apply to all premises within Lagos State, including business and residential premises unless otherwise specified."
        ),
      ],
    },
  };
}

// ─── notice to quit ──────────────────────────────────────────────────────────

const NOTICE_PERIODS: Record<Exclude<TenancyType, "fixed_term">, {
  label: string;
  period: string;
  para: string;
}> = {
  at_will: { label: "tenant at will", period: "1 week", para: "(a)" },
  monthly: { label: "monthly tenant", period: "1 month", para: "(b)" },
  quarterly: { label: "quarterly tenant", period: "3 months", para: "(c)" },
  half_yearly: { label: "half-yearly tenant", period: "3 months", para: "(d)" },
  yearly: { label: "yearly tenant", period: "6 months", para: "(e)" },
};

export interface NoticeQuery {
  tenancyType: TenancyType;
  /** True when the agreement itself states a notice period. */
  agreementStatesPeriod?: boolean;
}

export function checkNotice(q: NoticeQuery): Finding {
  if (q.tenancyType === "fixed_term") {
    return {
      verdict: "info",
      headline:
        "For a fixed term that has run its course, no notice to quit is required — but the landlord still cannot just evict you.",
      detail: [
        "Where a tenancy was for a fixed term (say 'one year certain') and that term has simply expired, the landlord does not owe you a notice to quit.",
        "What they must still do is serve seven days' written notice of their intention to go to court, and then actually go to court. Expiry of the term is not permission to change the locks.",
      ],
      citations: [
        cite(
          "s.13(5)",
          "In the case of a tenancy for a fixed term, no notice to quit shall be required once the tenancy has been determined by effluxion of time and where the landlord intends to proceed to Court to recover possession, he shall serve a seven (7) days written notice of his intention to apply to recover possession."
        ),
      ],
      actions: [
        "Keep every document you were served, with the date you received it.",
        "If you are locked out or threatened before a court order, that is a criminal offence — see the eviction check.",
      ],
    };
  }

  const rule = NOTICE_PERIODS[q.tenancyType];

  if (q.agreementStatesPeriod) {
    return {
      verdict: "depends",
      headline: `Your agreement decides — but the fallback for a ${rule.label} is ${rule.period}.`,
      detail: [
        `The statutory periods in s.13(1) apply only where the tenancy agreement says nothing about notice. Where your agreement does state a period, that agreed period governs, even if it is shorter than the Law's default.`,
        `This is the most common misunderstanding about Lagos tenancy: the six months a yearly tenant hears about is a fallback, not a floor. Read your agreement before relying on it.`,
      ],
      citations: [
        cite(
          "s.13(1)",
          "where there is no stipulation as to the notice to be given by either party to determine the tenancy, the following shall apply"
        ),
      ],
      actions: ["Find the notice clause in your tenancy agreement and read it before you respond."],
    };
  }

  return {
    verdict: "info",
    headline: `A ${rule.label} is entitled to ${rule.period}' notice.`,
    detail: [
      `Where the agreement is silent, s.13(1)${rule.para} sets the notice a ${rule.label} must be given to determine the tenancy.`,
      ...(["quarterly", "half_yearly", "yearly"].includes(q.tenancyType)
        ? [
            "The notice does not have to expire on the anniversary of your tenancy. It may end on or after the date the tenancy expires — so a notice is not invalid just because the dates do not line up with when you moved in.",
          ]
        : []),
    ],
    citations: [
      cite("s.13(1)" + rule.para, `${rule.period}${rule.period === "1 week" ? "'s" : "'"} notice for a ${rule.label}`),
      ...(["quarterly", "half_yearly", "yearly"].includes(q.tenancyType)
        ? [
            cite(
              "s.13(4)",
              "Notice for tenants under subsection (1) (c), (d) and (e) of this Section need not terminate on the anniversary of the tenancy but may terminate on or after the date of expiration of the tenancy."
            ),
          ]
        : []),
    ],
    actions: [
      "Note the date you received the notice in writing — the clock runs from service, not from the date typed on the letter.",
      "A notice to quit is not an eviction. Only a court can order you out.",
    ],
  };
}

// ─── advance rent ────────────────────────────────────────────────────────────

export interface AdvanceRentQuery {
  monthsDemanded: number;
  /** A sitting tenant is one already in the property, renewing. */
  isSittingTenant: boolean;
  tenancyType: TenancyType;
}

export function checkAdvanceRent(q: AdvanceRentQuery): Finding {
  const monthlyish = q.tenancyType === "monthly" || q.tenancyType === "at_will";
  const limitMonths = q.isSittingTenant ? (monthlyish ? 6 : 12) : 12;
  const limitLabel = limitMonths === 6 ? "six months" : "one year";
  const overLimit = q.monthsDemanded > limitMonths;

  const citations = [
    cite(
      q.isSittingTenant ? "s.4(1)" : "s.4(3)",
      q.isSittingTenant
        ? "It shall be unlawful for a landlord or his agent to demand or receive from a sitting tenant rent in excess of six (6) months from a monthly tenant and one (1) year from a yearly tenant"
        : "It shall be unlawful for a landlord or his agent to demand or receive from a new or would be tenant rent in excess of one (1) year in respect of any premises."
    ),
    cite(
      "s.4(5)",
      "Any person who receives or pays rent in excess of what is prescribed in this Section shall be guilty of an offence and shall be liable on conviction to a fine of One Hundred Thousand Naira (N100,000.00) or to three (3) months imprisonment"
    ),
  ];

  if (!overLimit) {
    return {
      verdict: "lawful",
      headline: `${q.monthsDemanded} months in advance is within the limit.`,
      detail: [
        `As ${q.isSittingTenant ? "a sitting tenant" : "a new tenant"}${
          q.isSittingTenant && monthlyish ? " on a monthly tenancy" : ""
        }, the most that can lawfully be demanded from you is ${limitLabel}.`,
      ],
      citations,
    };
  }

  return {
    verdict: "unlawful",
    headline: `Demanding ${q.monthsDemanded} months in advance is unlawful — the limit is ${limitLabel}.`,
    detail: [
      `It is an offence for a landlord or agent to demand or receive more than ${limitLabel} in advance from you, punishable by a ₦100,000 fine or three months' imprisonment.`,
      `Know this before you act: the Law makes it an offence for the tenant to *pay* it as well, not only for the landlord to demand it. In a market where two years upfront is routinely asked for, that cuts both ways — which is exactly why so few cases are ever brought.`,
    ],
    citations,
    actions: [
      "Ask for the demand in writing, or keep the WhatsApp message. A verbal demand is far harder to act on.",
      "Insist on a rent receipt for whatever you do pay — withholding one is itself an offence under s.5(3), carrying a ₦100,000 fine.",
    ],
  };
}

// ─── rent increase ───────────────────────────────────────────────────────────

export interface IncreaseQuery {
  currentRent: number;
  proposedRent: number;
}

/**
 * The question every Nigerian renter is actually asking.
 *
 * There is no percentage cap on rent increases in Lagos, and any tool that
 * implies one is lying. What the Law gives you instead is s.37: a route to ask
 * a court to declare an increase unreasonable — and s.37(2)(a) tells you what
 * the court weighs first, "the general level of rents in the locality".
 *
 * That is the entire reason this rules engine and the rent index belong in the
 * same product. The statute names the evidence; the index is the evidence.
 */
export function checkIncrease(q: IncreaseQuery): Finding {
  const pct =
    q.currentRent > 0
      ? Math.round(((q.proposedRent - q.currentRent) / q.currentRent) * 100)
      : 0;

  return {
    verdict: "depends",
    headline:
      pct > 0
        ? `A ${pct}% increase is not automatically illegal — but you can ask a court to rule it unreasonable.`
        : `That is not an increase.`,
    detail: [
      "Lagos law sets no maximum percentage. Anyone who tells you increases are capped at some figure is wrong, and acting on that will cost you.",
      "What the Law does give you is s.37: as an existing tenant you may apply to the Magistrate's Court (Form TL 11) for an order declaring the increase unreasonable. If the court agrees, it can substitute a specific amount.",
      "The first thing the court weighs is the general level of rents in your locality or a similar one. That is a comparison — which means evidence of what people nearby actually pay is the heart of your case.",
      "And critically: once you have filed, your landlord may not eject you while the case is pending.",
    ],
    citations: [
      cite(
        "s.37(1)",
        "Subject to any agreement to the contrary, an existing tenant may apply as in form TL 11 to the Court for an Order declaring that the increase in rent payable under a tenancy agreement is unreasonable."
      ),
      cite(
        "s.37(2)(a)",
        "In determining whether an increase in the rent is unreasonable, the Court ... shall consider the application on the following grounds - (a) the general level of rents in the locality or a similar locality for comparative analysis"
      ),
      cite(
        "s.37(4)",
        "Notwithstanding the provisions of any Law, it shall be unlawful for a landlord to eject a tenant from any premises pending the determination of the action."
      ),
    ],
    actions: [
      "Gather what comparable places nearby actually rent for — that is the court's first ground under s.37(2)(a).",
      "Keep the increase demand in writing, and your record of what you paid before.",
      "Note the words 'subject to any agreement to the contrary' — check whether your tenancy agreement signs this right away.",
    ],
  };
}

// ─── eviction and harassment ─────────────────────────────────────────────────

export interface EvictionQuery {
  lockedOut?: boolean;
  propertyDamaged?: boolean;
  threatened?: boolean;
  utilitiesCut?: boolean;
  hasCourtOrder?: boolean;
}

export function checkEviction(q: EvictionQuery): Finding {
  const selfHelp = Boolean(
    q.lockedOut || q.propertyDamaged || q.threatened || q.utilitiesCut
  );

  if (!selfHelp) {
    return {
      verdict: "info",
      headline: "Only a court can evict you.",
      detail: [
        "A notice to quit is a step towards possession, not possession itself. Your landlord must obtain a court order and the court issues a warrant — a landlord cannot lawfully remove you himself.",
      ],
      citations: [
        cite(
          "s.44(1)",
          "any person who in respect of any premises - (i) attempts to forcibly eject or forcibly ejects a tenant ... shall be guilty of an offence"
        ),
      ],
    };
  }

  const what: string[] = [];
  if (q.lockedOut) what.push("locking you out");
  if (q.propertyDamaged) what.push("damaging the premises");
  if (q.threatened) what.push("threatening you");
  if (q.utilitiesCut) what.push("cutting off services");

  return {
    verdict: "unlawful",
    headline: `${what[0][0].toUpperCase()}${what[0].slice(1)} to force you out is a criminal offence${
      q.hasCourtOrder ? " — even with a court order in hand." : "."
    }`,
    detail: [
      `Forcibly ejecting a tenant, threatening or molesting a tenant with a view to ejecting them, wilfully damaging the premises, or demolishing or altering a building to force a tenant out without the court's approval are all offences under s.44, carrying a fine of up to ₦250,000 or up to six months' imprisonment.`,
      ...(q.hasCourtOrder
        ? [
            "A court order does not authorise the landlord to act personally. The court issues a warrant for possession and it is executed by court officials — not by the landlord, his agent, or anyone he sends.",
          ]
        : []),
    ],
    citations: [
      cite(
        "s.44(1)",
        "Any person who demolishes, alters or modifies a building to which this law applies with a view to ejecting a tenant and without the approval of the Court; or any person who in respect of any premises - (i) attempts to forcibly eject or forcibly ejects a tenant; (ii) threatens or molests a tenant by action or words, with a view to ejecting such tenant; or (iii) willfully damages any premises, shall be guilty of an offence and is liable to a fine not exceeding Two Hundred and Fifty Thousand Naira (N250,000.00) or a maximum of six (6) months imprisonment"
      ),
    ],
    actions: [
      "Record what happened with dates, photographs and any messages — this is evidence of an offence, not just a dispute.",
      "Report it at the nearest police station and to the Lagos State Ministry of Justice Citizens' Mediation Centre.",
      "Do not retaliate in kind. Your position is strongest while the unlawful act is entirely on their side.",
    ],
  };
}

// ─── the 2025 Bill ───────────────────────────────────────────────────────────
//
// Live, widely reported, and NOT law. Renters are already repeating the 5%
// agency cap as though it were in force. Getting this distinction wrong is how
// someone refuses to pay a lawful fee and loses a home, so it is stated as
// clearly as the statute itself.

export interface PendingReform {
  status: string;
  proposals: string[];
  warning: string;
}

export const LAGOS_TENANCY_BILL_2025: PendingReform = {
  status:
    "Introduced July 2025, passed second reading 10 July 2025, and still at committee stage as of May 2026. It is not law and none of it is in force.",
  proposals: [
    "Agency or commission fees capped at 5% of one year's rent",
    "All estate agents required to register with LASRERA",
    "The law would apply across all of Lagos, removing the Apapa / Ikeja GRA / Ikoyi / Victoria Island exemption",
    "A ban on collecting more than one year's rent in advance from new tenants",
    "Weekend and public-holiday court sittings for tenancy disputes",
  ],
  warning:
    "Until it passes and is signed, the Tenancy Law 2011 is what governs your tenancy. Do not refuse a fee on the strength of the Bill.",
};
