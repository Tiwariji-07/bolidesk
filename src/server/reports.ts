import { addDays, businessDate, dateOnly, istInstant, isPastDue, toIsoDate, type IsoDate } from "@/domain/business-time";
import { getPrisma } from "./prisma";
import { invoiceBalance } from "./queries";

/** One IST calendar day: what came in, what went out, what was billed. */
export async function dayBook(workspaceId: string, day: IsoDate) {
  const from = istInstant(day, 0);
  const to = istInstant(addDays(day, 1), 0);
  const db = getPrisma();
  const [payments, invoices, creditNotes] = await Promise.all([
    db.payment.findMany({ where: { workspaceId, occurredAt: { gte: from, lt: to } }, include: { invoice: { select: { id: true, number: true, customer: { select: { name: true } } } }, recordedBy: { select: { name: true, email: true } } }, orderBy: { occurredAt: "asc" } }),
    db.invoice.findMany({ where: { workspaceId, issueDate: dateOnly(day), status: { not: "DRAFT" } }, include: { customer: { select: { name: true } } }, orderBy: { number: "asc" } }),
    db.creditNote.findMany({ where: { workspaceId, issueDate: dateOnly(day) }, include: { invoice: { select: { number: true } } }, orderBy: { number: "asc" } }),
  ]);
  const byMethod = new Map<string, number>();
  for (const payment of payments) byMethod.set(payment.method ?? "EARLIER", (byMethod.get(payment.method ?? "EARLIER") ?? 0) + payment.amountPaise);
  const sum = <T,>(rows: T[], pick: (row: T) => number) => rows.reduce((total, row) => total + pick(row), 0);
  return {
    payments, invoices, creditNotes,
    collected: sum(payments, (payment) => payment.amountPaise),
    byMethod: [...byMethod.entries()].sort((a, b) => b[1] - a[1]),
    billed: { taxable: sum(invoices, (invoice) => invoice.subtotalPaise), cgst: sum(invoices, (invoice) => invoice.cgstPaise), sgst: sum(invoices, (invoice) => invoice.sgstPaise), igst: sum(invoices, (invoice) => invoice.igstPaise), total: sum(invoices, (invoice) => invoice.totalPaise) },
    credited: sum(creditNotes, (note) => note.totalPaise),
  };
}

/** Money owed now, by how long it has been overdue (IST days). */
export async function receivablesAgeing(workspaceId: string, at = new Date()) {
  const invoices = await getPrisma().invoice.findMany({ where: { workspaceId, status: "SENT" }, include: { payments: { select: { amountPaise: true } }, creditNote: { select: { totalPaise: true } } } });
  const buckets = { current: 0, upTo30: 0, upTo60: 0, over60: 0 };
  const today = dateOnly(businessDate(at)).getTime();
  for (const invoice of invoices) {
    const due = invoiceBalance(invoice).due;
    if (!due) continue;
    if (!isPastDue(invoice.dueDate, at)) { buckets.current += due; continue; }
    const days = Math.round((today - invoice.dueDate!.getTime()) / 86_400_000);
    if (days <= 30) buckets.upTo30 += due; else if (days <= 60) buckets.upTo60 += due; else buckets.over60 += due;
  }
  return buckets;
}

const csvCell = (value: string | number | null | undefined) => {
  const text = value === null || value === undefined ? "" : String(value);
  // Text starting with = + - @ would run as a formula in spreadsheet apps; plain numbers like -90.00 stay numbers.
  const safe = /^[=+\-@\t\r]/.test(text) && !/^-?\d+(?:\.\d+)?$/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const rupees = (paise: number) => (paise / 100).toFixed(2);

/** Invoices and credit notes issued in a date range, in the columns accountants use for GSTR-1. */
export async function salesRegisterCsv(workspaceId: string, from: IsoDate, to: IsoDate) {
  const db = getPrisma();
  const range = { gte: dateOnly(from), lte: dateOnly(to) };
  const [invoices, notes] = await Promise.all([
    db.invoice.findMany({ where: { workspaceId, issueDate: range, status: { not: "DRAFT" } }, orderBy: [{ issueDate: "asc" }, { number: "asc" }] }),
    db.creditNote.findMany({ where: { workspaceId, issueDate: range }, include: { invoice: { select: { number: true, placeOfSupply: true, buyerSnapshot: true, documentType: true } } }, orderBy: [{ issueDate: "asc" }, { number: "asc" }] }),
  ]);
  const header = ["Type", "Number", "Date", "Against invoice", "Customer", "Customer GSTIN", "Place of supply", "Taxable value", "CGST", "SGST", "IGST", "Total"];
  const buyer = (snapshot: unknown) => (snapshot ?? {}) as { name?: string; gstin?: string | null };
  const rows = [
    ...invoices.map((invoice) => [invoice.documentType === "BILL_OF_SUPPLY" ? "Bill of supply" : "Tax invoice", invoice.number, invoice.issueDate ? toIsoDate(invoice.issueDate) : "", "", buyer(invoice.buyerSnapshot).name, buyer(invoice.buyerSnapshot).gstin, invoice.placeOfSupply, rupees(invoice.subtotalPaise), rupees(invoice.cgstPaise), rupees(invoice.sgstPaise), rupees(invoice.igstPaise), rupees(invoice.totalPaise)]),
    ...notes.map((note) => ["Credit note", note.number, toIsoDate(note.issueDate), note.invoice.number, buyer(note.invoice.buyerSnapshot).name, buyer(note.invoice.buyerSnapshot).gstin, note.invoice.placeOfSupply, rupees(-note.subtotalPaise), rupees(-note.cgstPaise), rupees(-note.sgstPaise), rupees(-note.igstPaise), rupees(-note.totalPaise)]),
  ];
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
