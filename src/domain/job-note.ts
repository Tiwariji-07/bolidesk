import { addDays, businessDate, isIsoDate, type IsoDate } from "./business-time";

/** A line as parsed from a note. Money is whole paise. A missing tax rate means "not said", for the reviewer to fill. */
export type ParsedLine = {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number | null;
};

export type ParsedJobNote = {
  customerName?: string;
  dueDate?: IsoDate;
  paymentTerms: string;
  lines: ParsedLine[];
};

export interface JobNoteParser {
  parse(note: string): ParsedJobNote;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const CURRENCY = String.raw`(?:₹|rs\.?|inr|rupees?|rupay|rupaye)`;
const AMOUNT = String.raw`(\d{1,3}(?:,\d{2,3})+|\d+)(?:\.(\d{1,2}))?`;
const QUANTITY = String.raw`(\d+(?:\.\d+)?)\s*(?:x|nos?\.?|pcs?|units?)?\s+`;

/** "1,200.50" -> 120050 paise. */
export function rupeesToPaise(whole: string, fraction = ""): number {
  return Number(whole.replace(/,/g, "")) * 100 + Number(fraction.padEnd(2, "0") || 0);
}

function singular(description: string, quantity: number) {
  if (quantity <= 1) return description;
  return description.replace(/(\w+?)(sses|ies|s)$/i, (_, stem: string, suffix: string) =>
    suffix.toLowerCase() === "sses" ? `${stem}ss` : suffix.toLowerCase() === "ies" ? `${stem}y` : /s$/i.test(stem) ? `${stem}s` : stem);
}

function cleanDescription(value: string) {
  return value.replace(/\s+/g, " ").replace(/^(?:and|plus|&|for|of)\s+/i, "").replace(/\s+(?:at|@|for|-|:)$/i, "").trim();
}

/** One item per segment: "2 AC services at Rs 650 each", "gas refill ₹2,500", "capacitor 450/-". */
function parseSegment(segment: string, defaultTax: number | null): ParsedLine | null {
  const text = segment.trim();
  const priced = new RegExp(String.raw`^(?:${QUANTITY})?(.+?)\s*(?:(?:at|@|for|-|:)\s*)?${CURRENCY}?\s*${AMOUNT}\s*(?:${CURRENCY}|\/-)?\s*(?:each|per\s+\w+|ka|ke)?$`, "i");
  const match = priced.exec(text);
  if (!match) return null;
  const [, quantityText, rawDescription, whole, fraction] = match;
  const quantity = quantityText ? Number(quantityText) : 1;
  const description = cleanDescription(rawDescription);
  if (!description || /^\d/.test(description) || quantity <= 0) return null;
  const unitPrice = rupeesToPaise(whole, fraction);
  if (unitPrice <= 0) return null;
  return { description: singular(description, quantity), quantity, unitPrice, taxRate: defaultTax };
}

function parseDueDate(note: string, today: IsoDate): IsoDate | undefined {
  const named = /due\s+(?:on\s+|by\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\.?,?\s+(\d{4})/i.exec(note);
  if (named) {
    const month = MONTHS.indexOf(named[2].slice(0, 3).toLowerCase()) + 1;
    const value = `${named[3]}-${String(month).padStart(2, "0")}-${named[1].padStart(2, "0")}`;
    return month && isIsoDate(value) ? value : undefined;
  }
  const numeric = /due\s+(?:on\s+|by\s+)?(\d{1,2})[/-](\d{1,2})[/-](\d{4})/i.exec(note);
  if (numeric) {
    const value = `${numeric[3]}-${numeric[2].padStart(2, "0")}-${numeric[1].padStart(2, "0")}`;
    return isIsoDate(value) ? value : undefined;
  }
  const relative = /\b(?:due\s+)?(?:in\s+)?(\d{1,3})\s+days?\b/i.exec(note);
  if (relative && /due|in\s+\d/i.test(relative[0])) return addDays(today, Number(relative[1]));
  if (/\b(?:due\s+)?(?:tomorrow|kal\s+tak)\b/i.test(note)) return addDays(today, 1);
  return undefined;
}

/** Local parser: prefills an editable draft. Anything it cannot read confidently is left out rather than guessed. */
export function parseJobNote(note: string, today: IsoDate = businessDate()): ParsedJobNote {
  const gst = /\b(?:gst|tax)\s*(?:@|of|at)?\s*(\d{1,2}(?:\.\d+)?)\s*%/i.exec(note) ?? /(\d{1,2}(?:\.\d+)?)\s*%\s*(?:gst|tax)/i.exec(note);
  const noGst = /\b(?:no|without|bina)\s+gst\b|\bgst\s+(?:free|nil|exempt)\b/i.test(note);
  const taxRate = noGst ? 0 : gst ? Number(gst[1]) : null;
  const dueDate = parseDueDate(note, today);
  const withoutMeta = note
    .replace(/\b(?:gst|tax)\s*(?:@|of|at)?\s*\d{1,2}(?:\.\d+)?\s*%|\d{1,2}(?:\.\d+)?\s*%\s*(?:gst|tax)|\b(?:no|without|bina)\s+gst\b/gi, "")
    .replace(/\bdue\b[^;\n]*?(?=,\s|;|\n|$)/gi, "").replace(/\bkal\s+tak\b/gi, "");
  const segments = withoutMeta.split(/(?<!\d),|,(?!\d)|[;\n]+|\s+(?:and|plus|aur)\s+(?=\d|[a-z])/i).map((part) => part.trim()).filter(Boolean);
  const first = segments[0];
  const customerName = first && !/\d/.test(first) && first.split(/\s+/).length <= 4 ? first.replace(/\s+(?:ji|sir|madam)$/i, "").trim() : undefined;
  const lines = segments.slice(customerName ? 1 : 0).map((segment) => parseSegment(segment, taxRate)).filter((line): line is ParsedLine => line !== null);
  return { customerName, dueDate, paymentTerms: dueDate ? `Due ${dueDate}` : "Due on receipt", lines };
}

export const localJobNoteParser: JobNoteParser = { parse: (note) => parseJobNote(note) };
