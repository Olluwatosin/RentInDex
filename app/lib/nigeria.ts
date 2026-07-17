// Shared Nigerian geography helpers (server-side).

export const NIGERIAN_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue",
  "Borno", "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "Gombe",
  "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara",
  "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau",
  "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara", "FCT Abuja",
];

// Detect a Nigerian state mentioned anywhere in free text. Returns the
// canonical state name, or null. Handles the common Abuja/FCT aliases.
export function detectState(text: string): string | null {
  const t = text.toLowerCase();
  if (/\bfct\b|\babuja\b|federal capital/.test(t)) return "FCT Abuja";
  for (const state of NIGERIAN_STATES) {
    if (state === "FCT Abuja") continue;
    const re = new RegExp(`\\b${state.toLowerCase()}\\b`);
    if (re.test(t)) return state;
  }
  return null;
}
