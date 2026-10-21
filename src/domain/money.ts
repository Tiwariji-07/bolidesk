/** All money is integer paise. One document is capped well inside Postgres INTEGER. */
export const MAX_DOCUMENT_PAISE = 2_000_000_000; // ₹2,00,00,000 (2 crore), inside Postgres INTEGER

/** "1,250.5" or "1250.50" -> 125050. Returns null for anything that is not a plain non-negative rupee amount. */
export function parseRupees(input: string): number | null {
  const text = input.trim().replace(/^₹\s*/, "");
  const match = /^(\d{1,3}(?:,\d{2})*,\d{3}|\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const paise = Number(match[1].replace(/,/g, "")) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(paise) && paise <= MAX_DOCUMENT_PAISE ? paise : null;
}

/** 125050 -> "1250.50" for form fields. */
export function paiseToRupeeInput(paise: number) {
  const rupees = Math.trunc(paise / 100);
  const rest = Math.abs(paise % 100);
  return rest ? `${rupees}.${String(rest).padStart(2, "0")}` : String(rupees);
}

/** Round half up for non-negative integers: (n / d) to the nearest integer. */
export function roundHalfUp(numerator: number, denominator: number) {
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}
