import type { Invoice } from "@prisma/client";
import { balanceOf, invoiceDisplayStatus, type Balance } from "@/domain/documents";
import { getPrisma } from "./prisma";

/** Workspace-scoped reads. Every query filters by workspaceId; ids from the browser are never enough on their own. */

export function getWorkspace(workspaceId: string) {
  return getPrisma().workspace.findUniqueOrThrow({ where: { id: workspaceId } });
}

type InvoiceMoney = Pick<Invoice, "status" | "totalPaise" | "dueDate"> & { payments: { amountPaise: number }[]; creditNote?: { totalPaise: number } | null };

/** Balance from the ledger. Every invoice query below includes its payment amounts. */
export function invoiceBalance(invoice: InvoiceMoney): Balance {
  const balance = balanceOf(invoice.totalPaise, invoice.creditNote?.totalPaise ?? 0, invoice.payments.reduce((sum, payment) => sum + payment.amountPaise, 0));
  // A draft is not a demand for money: nothing is collectible until it is issued.
  return invoice.status === "DRAFT" ? { ...balance, due: 0 } : balance;
}

const paymentAmounts = { payments: { select: { amountPaise: true } }, creditNote: { select: { totalPaise: true } } } as const;

export function withBalance<T extends InvoiceMoney>(invoice: T) {
  const balance = invoiceBalance(invoice);
  return { ...invoice, balance, displayStatus: invoiceDisplayStatus(invoice, balance) };
}

export async function listInvoices(workspaceId: string) {
  const invoices = await getPrisma().invoice.findMany({ where: { workspaceId }, include: { customer: { select: { id: true, name: true } }, ...paymentAmounts }, orderBy: [{ issuedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }] });
  return invoices.map(withBalance);
}

export async function getInvoice(workspaceId: string, id: string) {
  const invoice = await getPrisma().invoice.findFirst({ where: { id, workspaceId }, include: { customer: true, quote: { select: { id: true, number: true } }, creditNote: true, payments: { orderBy: { occurredAt: "asc" }, include: { recordedBy: { select: { name: true, email: true } }, reversal: { select: { id: true } } } }, paymentRequests: { where: { status: { in: ["PENDING", "ACTIVE", "CANCELLING"] } }, take: 1 } } });
  return invoice ? withBalance(invoice) : null;
}

export function listQuotes(workspaceId: string) {
  return getPrisma().quote.findMany({ where: { workspaceId }, include: { customer: { select: { id: true, name: true } }, invoice: { select: { id: true, number: true } } }, orderBy: { createdAt: "desc" } });
}

export function getQuote(workspaceId: string, id: string) {
  return getPrisma().quote.findFirst({ where: { id, workspaceId }, include: { customer: true, job: { select: { id: true, note: true } }, invoice: { select: { id: true, number: true } } } });
}

export async function listCustomers(workspaceId: string) {
  const [customers, invoices] = await Promise.all([
    getPrisma().customer.findMany({ where: { workspaceId }, orderBy: { name: "asc" }, include: { _count: { select: { jobs: true } } } }),
    listInvoices(workspaceId),
  ]);
  const due = new Map<string, number>();
  for (const invoice of invoices) due.set(invoice.customerId, (due.get(invoice.customerId) ?? 0) + invoice.balance.due);
  return customers.map((customer) => ({ ...customer, duePaise: due.get(customer.id) ?? 0 }));
}

export function getCustomer(workspaceId: string, id: string) {
  return getPrisma().customer.findFirst({ where: { id, workspaceId } });
}

export function listJobs(workspaceId: string) {
  return getPrisma().job.findMany({ where: { workspaceId }, include: { customer: { select: { id: true, name: true } }, quote: { select: { id: true, number: true, status: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
}

export function getJob(workspaceId: string, id: string) {
  return getPrisma().job.findFirst({ where: { id, workspaceId }, include: { customer: { select: { id: true, name: true } }, quote: { select: { id: true, number: true, status: true } } } });
}

export function listActivities(workspaceId: string, take = 20) {
  return getPrisma().activity.findMany({ where: { workspaceId }, include: { actor: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" }, take });
}
