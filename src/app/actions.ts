"use server";

import { revalidatePath } from "next/cache";
import { currentWorkspaceId } from "@/server/current-workspace";
import { forWorkspace } from "@/server/persistence";
import { createProviders } from "@/server/integrations/providers";
import { customerInputSchema, followUpInputSchema, jobInputSchema, quoteStatusSchema, workspaceSettingsSchema } from "@/server/validation";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
const message = (error: unknown) => error instanceof Error ? error.message : "Could not save your changes.";
const invalidate = (...paths: string[]) => paths.forEach((path) => revalidatePath(path));

export async function createCustomer(values: unknown): Promise<Result<{ id: string }>> {
  const input = customerInputSchema.safeParse(values);
  if (!input.success) return { ok: false, error: "Enter a name, valid mobile number, and optional valid email." };
  try { const customer = await forWorkspace(await currentWorkspaceId()).customers.create(input.data); invalidate("/customers", "/"); return { ok: true, data: { id: customer.id } }; } catch (error) { return { ok: false, error: message(error) }; }
}

export async function updateCustomer(id: string, values: unknown): Promise<Result> {
  const input = customerInputSchema.partial().safeParse(values);
  if (!input.success || !Object.keys(input.data).length) return { ok: false, error: "Enter valid customer details." };
  try { await forWorkspace(await currentWorkspaceId()).customers.update(id, input.data); invalidate("/customers", "/"); return { ok: true }; } catch (error) { return { ok: false, error: message(error) }; }
}

export async function parseAndSaveJob(values: unknown): Promise<Result<{ id: string; parsed: unknown }>> {
  const input = jobInputSchema.safeParse(values);
  if (!input.success) return { ok: false, error: "Enter a job note between 8 and 2,000 characters." };
  try { const { job, parsed } = await forWorkspace(await currentWorkspaceId()).jobs.parseAndSave(input.data, createProviders().jobParser); invalidate("/jobs", "/"); return { ok: true, data: { id: job.id, parsed } }; } catch (error) { return { ok: false, error: message(error) }; }
}

export async function createQuoteFromJob(jobId: string): Promise<Result<{ id: string }>> {
  if (!jobId) return { ok: false, error: "Save a job before creating a quote." };
  try { const quote = await forWorkspace(await currentWorkspaceId()).quotes.createFromJob(jobId); invalidate("/quotes", "/", "/jobs"); return { ok: true, data: { id: quote.id } }; } catch (error) { return { ok: false, error: message(error) }; }
}

export async function changeQuoteStatus(id: string, status: unknown): Promise<Result> {
  const parsed = quoteStatusSchema.safeParse(status);
  if (!parsed.success) return { ok: false, error: "Choose a valid quote status." };
  try { await forWorkspace(await currentWorkspaceId()).quotes.changeStatus(id, parsed.data); invalidate("/quotes", "/", "/follow-ups"); return { ok: true }; } catch (error) { return { ok: false, error: message(error) }; }
}

export async function convertQuoteToInvoice(quoteId: string): Promise<Result<{ number: string }>> {
  if (!quoteId) return { ok: false, error: "Quote is required." };
  try { const invoice = await forWorkspace(await currentWorkspaceId()).invoices.convertAcceptedQuote(quoteId); invalidate("/invoices", "/quotes", "/"); return { ok: true, data: { number: invoice.number } }; } catch (error) { return { ok: false, error: message(error) }; }
}

export async function createQuotePortalLink(quoteId: string): Promise<Result<{ url: string }>> {
  if (!quoteId) return { ok: false, error: "Quote is required." };
  try { const portal = await forWorkspace(await currentWorkspaceId()).portalTokens.createForQuote(quoteId); return { ok: true, data: { url: portal.url } }; } catch (error) { return { ok: false, error: message(error) }; }
}

export async function createPaymentRequest(invoiceId: string): Promise<Result<{ url: string }>> {
  if (!invoiceId) return { ok: false, error: "Invoice is required." };
  try { const request = await forWorkspace(await currentWorkspaceId()).invoices.createPaymentRequest(invoiceId, { paymentProvider: createProviders().payments }); invalidate("/invoices", "/"); return { ok: true, data: { url: request.url } }; } catch (error) { return { ok: false, error: message(error) }; }
}

export async function markInvoicePaid(invoiceId: string): Promise<Result> {
  if (!invoiceId) return { ok: false, error: "Invoice is required." };
  try { await forWorkspace(await currentWorkspaceId()).invoices.markPaid(invoiceId); invalidate("/invoices", "/", "/follow-ups"); return { ok: true }; } catch (error) { return { ok: false, error: message(error) }; }
}

export async function createFollowUp(values: unknown): Promise<Result> {
  const input = followUpInputSchema.safeParse(values);
  if (!input.success) return { ok: false, error: "Enter a subject, action and due date." };
  try { await forWorkspace(await currentWorkspaceId()).followUps.create(input.data); invalidate("/follow-ups", "/"); return { ok: true }; } catch (error) { return { ok: false, error: message(error) }; }
}

export async function snoozeFollowUp(id: string): Promise<Result> {
  if (!id) return { ok: false, error: "Follow-up is required." };
  try { const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(9, 0, 0, 0); await forWorkspace(await currentWorkspaceId()).followUps.snooze(id, tomorrow); invalidate("/follow-ups", "/"); return { ok: true }; } catch (error) { return { ok: false, error: message(error) }; }
}

export async function completeFollowUp(id: string): Promise<Result> {
  if (!id) return { ok: false, error: "Follow-up is required." };
  try { await forWorkspace(await currentWorkspaceId()).followUps.complete(id); invalidate("/follow-ups", "/"); return { ok: true }; } catch (error) { return { ok: false, error: message(error) }; }
}

export async function updateWorkspaceSettings(values: unknown): Promise<Result> {
  const input = workspaceSettingsSchema.safeParse(values);
  if (!input.success) return { ok: false, error: "Enter a business name and valid invoice prefix." };
  try { await forWorkspace(await currentWorkspaceId()).workspace.updateSettings(input.data); invalidate("/settings", "/", "/invoices"); return { ok: true }; } catch (error) { return { ok: false, error: message(error) }; }
}
