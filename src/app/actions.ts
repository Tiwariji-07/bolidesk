"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAccess } from "@/server/access";
import { assignJobCustomer, convertQuote, createBlankInvoice, createBlankQuote, createQuoteFromJob, issueInvoice, moveQuote, saveInvoiceDraft, saveJob, saveQuoteDraft, type DraftInput } from "@/server/billing";
import { createCustomer, updateCustomer, updateSettings, type CustomerInput, type SettingsInput } from "@/server/customers";
import { attempt, UserError } from "@/server/errors";
import { issueCreditNote } from "@/server/credit-notes";
import { sendInvoiceMessage, type MessagePurpose } from "@/server/delivery";
import { completeFollowUp, createFollowUp, snoozeFollowUp } from "@/server/followups";
import { createProviders } from "@/server/integrations/providers";
import { createPaymentRequest, recordPayment, recordRefund, reversePayment } from "@/server/payments";
import { sharePortalLink } from "@/server/portal";

const refresh = (...paths: string[]) => paths.forEach((path) => revalidatePath(path));
const id = (value: unknown, label: string) => {
  const parsed = z.string().min(1).max(64).safeParse(value);
  if (!parsed.success) throw new UserError(`${label} is required.`);
  return parsed.data;
};

export async function createCustomerAction(values: CustomerInput) {
  return attempt(async () => {
    const customer = await createCustomer(await requireAccess("customers.write"), values);
    refresh("/customers", "/jobs");
    return { id: customer.id, name: customer.name };
  });
}

export async function updateCustomerAction(customerId: string, values: CustomerInput) {
  return attempt(async () => {
    await updateCustomer(await requireAccess("customers.write"), id(customerId, "Customer"), values);
    refresh("/customers");
  });
}

export async function saveJobAction(values: { note: unknown; customerId?: unknown }) {
  return attempt(async () => {
    const input = z.object({ note: z.string().trim().min(8, "Write at least a few words about the job.").max(2000), customerId: z.string().min(1).optional() }).safeParse({ note: values.note, customerId: values.customerId || undefined });
    if (!input.success) throw new UserError(input.error.issues[0]?.message ?? "Check the job note.");
    // Access is resolved first, the note is parsed outside any transaction, and the save re-checks the session under the lock.
    const access = await requireAccess("jobs.write");
    const { job, parsed } = await saveJob(access, input.data, createProviders().jobParser);
    refresh("/jobs");
    return { id: job.id, parsed };
  }, "The job could not be saved. Try again.");
}

export async function assignJobCustomerAction(jobId: string, customerId: string) {
  return attempt(async () => {
    await assignJobCustomer(await requireAccess("jobs.write"), id(jobId, "Job"), id(customerId, "Customer"));
    refresh("/jobs");
  });
}

export async function createQuoteFromJobAction(jobId: string) {
  return attempt(async () => {
    const quote = await createQuoteFromJob(await requireAccess("quotes.draft"), id(jobId, "Job"));
    refresh("/quotes", "/jobs");
    return { id: quote.id };
  });
}

export async function createBlankQuoteAction(customerId: string) {
  return attempt(async () => ({ id: (await createBlankQuote(await requireAccess("quotes.draft"), id(customerId, "Customer"))).id }));
}

export async function saveQuoteDraftAction(input: DraftInput) {
  return attempt(async () => {
    await saveQuoteDraft(await requireAccess("quotes.draft"), input);
    refresh("/quotes", `/quotes/${input.id}`);
  });
}

export async function moveQuoteAction(quoteId: string, status: unknown, version?: number) {
  return attempt(async () => {
    const to = z.enum(["SENT", "ACCEPTED", "REJECTED"]).safeParse(status);
    if (!to.success) throw new UserError("Choose a valid quote status.");
    const result = await moveQuote(await requireAccess("quotes.decide"), id(quoteId, "Quote"), to.data, version);
    refresh("/quotes", `/quotes/${quoteId}`, "/");
    return result;
  });
}

export async function convertQuoteAction(quoteId: string) {
  return attempt(async () => {
    const invoice = await convertQuote(await requireAccess("invoices.write"), id(quoteId, "Quote"));
    refresh("/invoices", "/quotes", "/");
    return { id: invoice.id };
  });
}

export async function createBlankInvoiceAction(customerId: string) {
  return attempt(async () => ({ id: (await createBlankInvoice(await requireAccess("invoices.write"), id(customerId, "Customer"))).id }));
}

export async function saveInvoiceDraftAction(input: DraftInput) {
  return attempt(async () => {
    await saveInvoiceDraft(await requireAccess("invoices.write"), input);
    refresh("/invoices", `/invoices/${input.id}`);
  });
}

export async function issueInvoiceAction(invoiceId: string, version: number) {
  return attempt(async () => {
    const invoice = await issueInvoice(await requireAccess("invoices.write"), { id: id(invoiceId, "Invoice"), version });
    refresh("/invoices", `/invoices/${invoiceId}`, "/");
    return { number: invoice.number };
  });
}

export async function sharePortalLinkAction(target: { quoteId?: string; invoiceId?: string }) {
  return attempt(async () => {
    const link = await sharePortalLink(await requireAccess("portal.share"), target);
    return { url: link.url };
  });
}

export async function createPaymentRequestAction(invoiceId: string) {
  return attempt(async () => {
    const request = await createPaymentRequest(await requireAccess("payments.request"), id(invoiceId, "Invoice"), createProviders().payments);
    refresh("/invoices", `/invoices/${invoiceId}`);
    // Customers get the private invoice page; it carries the Razorpay button when one exists.
    return { url: request.portalUrl, demo: request.demo };
  }, "The payment link could not be created. Try again in a minute.");
}

export async function recordPaymentAction(values: { invoiceId: string; amount: string; method: string; reference?: string; idempotencyKey: string; draftVersion?: number }) {
  return attempt(async () => {
    const access = await requireAccess(values.method === "CASH" ? "payments.cash" : "payments.manual");
    const result = await recordPayment(access, values as never, createProviders().payments);
    refresh("/invoices", `/invoices/${values.invoiceId}`, "/", "/follow-ups", "/reports");
    return result;
  });
}

export async function reversePaymentAction(paymentId: string, invoiceId: string, reason: string) {
  return attempt(async () => {
    await reversePayment(await requireAccess("payments.correct"), id(paymentId, "Receipt"), String(reason ?? ""), createProviders().payments);
    refresh("/invoices", `/invoices/${invoiceId}`, "/", "/reports");
  });
}

export async function recordRefundAction(values: { invoiceId: string; amount: string; method: "CASH" | "UPI" | "CARD" | "BANK"; reference: string; reason: string }) {
  return attempt(async () => {
    const method = z.enum(["CASH", "UPI", "CARD", "BANK"]).parse(values.method);
    await recordRefund(await requireAccess("payments.correct"), { ...values, method });
    refresh("/invoices", `/invoices/${values.invoiceId}`, "/", "/reports");
  });
}

export async function issueCreditNoteAction(invoiceId: string, version: number, reason: string) {
  return attempt(async () => {
    const result = await issueCreditNote(await requireAccess("credit.issue"), { invoiceId: id(invoiceId, "Invoice"), version, reason: String(reason ?? "") }, createProviders().payments);
    refresh("/invoices", `/invoices/${invoiceId}`, "/", "/reports");
    return result;
  });
}

export async function sendWhatsAppAction(invoiceId: string, purpose: MessagePurpose) {
  return attempt(async () => {
    const result = await sendInvoiceMessage(await requireAccess("messages.send"), id(invoiceId, "Invoice"), purpose === "reminder" ? "reminder" : "invoice", createProviders().messaging);
    refresh(`/invoices/${invoiceId}`);
    return result;
  });
}

export async function createFollowUpAction(values: { subject: unknown; action: unknown; dueAt: unknown }) {
  return attempt(async () => {
    await createFollowUp(await requireAccess("followups.write"), values as never);
    refresh("/follow-ups", "/");
  });
}

export async function snoozeFollowUpAction(followUpId: string) {
  return attempt(async () => {
    await snoozeFollowUp(await requireAccess("followups.write"), id(followUpId, "Follow-up"));
    refresh("/follow-ups", "/");
  });
}

export async function completeFollowUpAction(followUpId: string) {
  return attempt(async () => {
    await completeFollowUp(await requireAccess("followups.write"), id(followUpId, "Follow-up"));
    refresh("/follow-ups", "/");
  });
}

export async function updateSettingsAction(values: SettingsInput) {
  return attempt(async () => {
    await updateSettings(await requireAccess("settings.write"), values);
    refresh("/settings", "/");
  });
}
