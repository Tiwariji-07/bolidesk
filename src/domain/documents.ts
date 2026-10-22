import { financialYear, isPastDue, type IsoDate } from "./business-time";

export type QuoteStatus = "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "INVOICED";
export type InvoiceStatus = "DRAFT" | "SENT" | "PAID" | "CREDITED";
export type DocumentKind = "INVOICE" | "QUOTE" | "RECEIPT" | "CREDIT_NOTE";

/** Staff-driven quote moves. INVOICED is set only by conversion. */
const quoteTransitions: Record<QuoteStatus, QuoteStatus[]> = {
  DRAFT: ["SENT"],
  SENT: ["ACCEPTED", "REJECTED"],
  ACCEPTED: [],
  REJECTED: [],
  INVOICED: [],
};

export function canMoveQuote(from: QuoteStatus, to: QuoteStatus) {
  return quoteTransitions[from].includes(to);
}

const KIND_CODE: Record<DocumentKind, string> = { INVOICE: "I", QUOTE: "Q", RECEIPT: "R", CREDIT_NOTE: "C" };

/**
 * GST Rule 46 series: at most 16 characters, unique per financial year.
 * "BD" + "I" + "-2627-" + "000001" = "BDI-2627-000001" (15 chars with a 2-char prefix, 16 with 3).
 */
export function documentNumber(prefix: string, kind: DocumentKind, issueDate: IsoDate, sequence: number) {
  if (!/^[A-Z0-9]{1,3}$/.test(prefix)) throw new Error("Document prefix must be 1–3 letters or digits.");
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 999999) throw new Error("Document series exhausted for this financial year.");
  return `${prefix}${KIND_CODE[kind]}-${financialYear(issueDate)}-${String(sequence).padStart(6, "0")}`;
}

export type Balance = { total: number; credited: number; paid: number; due: number; refundDue: number };

export function balanceOf(total: number, credited: number, paid: number): Balance {
  const net = total - credited;
  return { total, credited, paid, due: Math.max(net - paid, 0), refundDue: Math.max(paid - net, 0) };
}

/** Stored status after a payment or credit. Drafts stay drafts; OVERDUE is never stored. */
export function settledStatus(current: InvoiceStatus, balance: Balance): InvoiceStatus {
  if (current === "DRAFT") return "DRAFT";
  if (balance.total > 0 && balance.credited >= balance.total) return "CREDITED";
  return balance.due === 0 ? "PAID" : "SENT";
}

export type InvoiceDisplayStatus = InvoiceStatus | "OVERDUE" | "PART_PAID";

export function invoiceDisplayStatus(invoice: { status: InvoiceStatus; dueDate: Date | null }, balance: Balance, at = new Date()): InvoiceDisplayStatus {
  if (invoice.status !== "SENT") return invoice.status;
  if (balance.due > 0 && isPastDue(invoice.dueDate, at)) return "OVERDUE";
  return balance.paid > 0 ? "PART_PAID" : "SENT";
}
