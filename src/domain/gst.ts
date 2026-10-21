import { MAX_DOCUMENT_PAISE, roundHalfUp } from "./money";

export type GstRateProfile = "REFORM_2025" | "LEGACY_2017";
/** Rates (percent) a workspace may charge. The 22 Sep 2025 reform moved most supplies to 5% and 18%, with 40% for a few. */
export const ALLOWED_RATES: Record<GstRateProfile, number[]> = {
  REFORM_2025: [0, 5, 18, 40],
  LEGACY_2017: [0, 5, 12, 18, 28],
};

export type GstScheme = "REGULAR" | "COMPOSITION" | "UNREGISTERED";
/** INTRA: CGST + SGST. INTER: IGST. NONE: bill of supply, no GST charged. */
export type TaxMode = "INTRA" | "INTER" | "NONE";

export type DocumentLine = {
  description: string;
  /** Up to three decimals, e.g. 1.5 hours. */
  quantity: number;
  /** Paise per unit, before tax. */
  unitPrice: number;
  /** Percent, from the workspace's rate profile. */
  taxRate: number;
  /** SAC (services, 6 digits) or HSN (goods, 4/6/8 digits). Optional on drafts, required to issue a tax invoice. */
  code?: string;
};

export type CalculatedLine = DocumentLine & { taxable: number; cgst: number; sgst: number; igst: number };
export type DocumentTotals = { lines: CalculatedLine[]; subtotal: number; cgst: number; sgst: number; igst: number; tax: number; total: number };

export function taxModeFor(scheme: GstScheme | null | undefined, sellerState: string | null | undefined, placeOfSupply: string | null | undefined): TaxMode {
  if (scheme !== "REGULAR") return "NONE";
  return sellerState && placeOfSupply && sellerState !== placeOfSupply ? "INTER" : "INTRA";
}

/** Per line, per tax head, rounded half up to the paisa; never split a rounded combined tax. */
export function calculateDocument(lines: DocumentLine[], mode: TaxMode): DocumentTotals {
  const calculated = lines.map((line) => {
    const taxable = roundHalfUp(line.unitPrice * Math.round(line.quantity * 1000), 1000);
    const bps = mode === "NONE" ? 0 : Math.round(line.taxRate * 100);
    const half = mode === "INTRA" ? roundHalfUp(taxable * bps, 20000) : 0;
    const igst = mode === "INTER" ? roundHalfUp(taxable * bps, 10000) : 0;
    return { ...line, taxRate: mode === "NONE" ? 0 : line.taxRate, taxable, cgst: half, sgst: half, igst };
  });
  const sum = (key: "taxable" | "cgst" | "sgst" | "igst") => calculated.reduce((total, line) => total + line[key], 0);
  const subtotal = sum("taxable");
  const tax = sum("cgst") + sum("sgst") + sum("igst");
  return { lines: calculated, subtotal, cgst: sum("cgst"), sgst: sum("sgst"), igst: sum("igst"), tax, total: subtotal + tax };
}

export type LineIssue = { line: number; message: string };

/** Checks lines before saving a draft (shape) or issuing (completeness for the tax mode). */
export function validateLines(lines: DocumentLine[], options: { profile: GstRateProfile; mode: TaxMode; issuing: boolean }): LineIssue[] {
  const issues: LineIssue[] = [];
  if (!lines.length) issues.push({ line: 0, message: "Add at least one line." });
  if (lines.length > 50) issues.push({ line: 0, message: "Use at most 50 lines." });
  lines.forEach((line, index) => {
    const at = index + 1;
    if (!line.description.trim() || line.description.length > 240) issues.push({ line: at, message: "Describe the work in 1–240 characters." });
    if (!(line.quantity > 0) || line.quantity > 100000 || Math.abs(line.quantity * 1000 - Math.round(line.quantity * 1000)) > 1e-6) issues.push({ line: at, message: "Quantity must be positive with at most three decimals." });
    if (!Number.isInteger(line.unitPrice) || line.unitPrice < 0) issues.push({ line: at, message: "Enter a valid price." });
    if (options.mode !== "NONE" && !ALLOWED_RATES[options.profile].includes(line.taxRate)) issues.push({ line: at, message: `GST rate must be one of ${ALLOWED_RATES[options.profile].join("%, ")}%.` });
    if (line.code && !/^(?:\d{4}|\d{6}|\d{8})$/.test(line.code)) issues.push({ line: at, message: "SAC/HSN must be 4, 6 or 8 digits." });
    if (options.issuing && options.mode !== "NONE" && !line.code) issues.push({ line: at, message: "Add the SAC or HSN code before issuing a tax invoice." });
  });
  if (!issues.length && calculateDocument(lines, options.mode).total > MAX_DOCUMENT_PAISE) issues.push({ line: 0, message: "One document cannot exceed ₹2 crore." });
  return issues;
}

/** Indian state/UT GST codes. */
export const STATES: Record<string, string> = {
  "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana", "07": "Delhi",
  "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur",
  "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand", "21": "Odisha",
  "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat", "26": "Dadra and Nagar Haveli and Daman and Diu", "27": "Maharashtra",
  "29": "Karnataka", "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry",
  "35": "Andaman and Nicobar Islands", "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh",
};

/** Union territories without a legislature charge UTGST instead of SGST, which this release does not print. */
export const UTGST_STATES = new Set(["04", "26", "31", "35", "38"]);

const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** 15-character GSTIN with a valid state code and checksum. */
export function isValidGstin(value: string) {
  const gstin = value.trim().toUpperCase();
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin) || !STATES[gstin.slice(0, 2)]) return false;
  let sum = 0;
  for (let index = 0; index < 14; index += 1) {
    const product = GSTIN_CHARS.indexOf(gstin[index]) * (index % 2 ? 2 : 1);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36] === gstin[14];
}
