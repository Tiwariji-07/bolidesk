import type { DocumentKind, Invoice, Prisma, Workspace } from "@prisma/client";
import { z } from "zod";
import { businessDate, dateOnly, isIsoDate, type IsoDate } from "@/domain/business-time";
import { canMoveQuote, documentNumber, type QuoteStatus } from "@/domain/documents";
import { calculateDocument, isValidGstin, STATES, taxModeFor, UTGST_STATES, validateLines, type DocumentLine, type GstRateProfile, type TaxMode } from "@/domain/gst";
import type { ParsedJobNote } from "@/domain/job-note";
import { parseRupees } from "@/domain/money";
import type { Access } from "./access";
import { ConflictError, UserError } from "./errors";
import type { JobParserProvider } from "./integrations/types";
import { logActivity, withStaffLock, type Actor, type Tx } from "./workspace-tx";

/** Line as typed in an editor: prices are rupee text, converted here, never trusted as paise from the browser. */
export const lineInputSchema = z.object({
  description: z.string().trim().min(1).max(240),
  quantity: z.coerce.number().positive().max(100000),
  unitPrice: z.string().trim().max(20),
  taxRate: z.coerce.number().min(0).max(40),
  code: z.string().trim().max(8).optional().transform((value) => value || undefined),
});
export type LineInput = z.input<typeof lineInputSchema>;

export const draftInputSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().min(0),
  lines: z.array(lineInputSchema).min(1).max(50),
  dueDate: z.string().optional().transform((value) => value || undefined).refine((value) => !value || isIsoDate(value), "Enter a real due date."),
  placeOfSupply: z.string().optional().transform((value) => value || undefined).refine((value) => !value || Boolean(STATES[value]), "Choose a valid state."),
  paymentTerms: z.string().trim().max(200).optional().transform((value) => value || undefined),
});
export type DraftInput = z.input<typeof draftInputSchema>;

export function toDocumentLines(lines: z.output<typeof lineInputSchema>[]): DocumentLine[] {
  return lines.map((line, index) => {
    const unitPrice = parseRupees(line.unitPrice);
    if (unitPrice === null) throw new UserError(`Line ${index + 1}: enter the price in rupees, like 650 or 1,250.50.`);
    return { description: line.description, quantity: line.quantity, unitPrice, taxRate: line.taxRate, code: line.code };
  });
}

export function storedLines(json: Prisma.JsonValue): DocumentLine[] {
  return Array.isArray(json) ? (json as DocumentLine[]) : [];
}

export function workspaceMode(workspace: Pick<Workspace, "gstScheme" | "stateCode">, placeOfSupply: string | null | undefined): TaxMode {
  return taxModeFor(workspace.gstScheme, workspace.stateCode, placeOfSupply ?? workspace.stateCode);
}

function ensureValid(lines: DocumentLine[], workspace: Workspace, mode: TaxMode, issuing: boolean) {
  const issues = validateLines(lines, { profile: workspace.gstRateProfile as GstRateProfile, mode, issuing });
  if (issues.length) throw new UserError(issues.map((issue) => issue.line ? `Line ${issue.line}: ${issue.message}` : issue.message).join(" "));
}

async function loadWorkspace(tx: Tx, workspaceId: string) {
  return tx.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
}

/** Atomic increment inside the caller's transaction; a rolled-back document never consumes a number. */
export async function allocateNumber(tx: Tx, workspace: Pick<Workspace, "id" | "invoicePrefix">, kind: DocumentKind, issueDate: IsoDate) {
  const financialYear = documentNumber(workspace.invoicePrefix, kind, issueDate, 1).split("-")[1];
  const rows = await tx.$queryRaw<{ lastValue: number }[]>`
    INSERT INTO "DocumentCounter" ("workspaceId", "kind", "financialYear", "lastValue")
    VALUES (${workspace.id}, ${kind}::"DocumentKind", ${financialYear}, 1)
    ON CONFLICT ("workspaceId", "kind", "financialYear")
    DO UPDATE SET "lastValue" = "DocumentCounter"."lastValue" + 1
    WHERE "DocumentCounter"."lastValue" < 999999
    RETURNING "lastValue"`;
  if (rows.length !== 1) throw new UserError("This document series is full for the financial year.");
  return documentNumber(workspace.invoicePrefix, kind, issueDate, rows[0].lastValue);
}

function defaultLines(parsed: ParsedJobNote | null, workspace: Workspace): DocumentLine[] {
  return (parsed?.lines ?? []).map((line) => ({ description: line.description, quantity: line.quantity, unitPrice: line.unitPrice, taxRate: line.taxRate ?? workspace.defaultTaxRate, code: workspace.defaultCode ?? undefined }));
}

function totalsFor(lines: DocumentLine[], workspace: Workspace, placeOfSupply: string | null | undefined) {
  return calculateDocument(lines, workspaceMode(workspace, placeOfSupply));
}

/** The note is parsed outside the transaction (it may call OpenAI); the job is written under the lock. */
export async function saveJob(access: Access, input: { note: string; customerId?: string }, parser: JobParserProvider) {
  const parsed = await parser.parse(input.note);
  return withStaffLock(access, "jobs.write", async (tx, actor) => {
    if (input.customerId && !(await tx.customer.findFirst({ where: { id: input.customerId, workspaceId: actor.workspaceId } }))) throw new UserError("Customer not found.");
    const job = await tx.job.create({ data: { workspaceId: actor.workspaceId, customerId: input.customerId, note: input.note, parsedJson: parsed as unknown as Prisma.InputJsonValue } });
    await logActivity(tx, actor, "Job note saved");
    return { job, parsed };
  });
}

export async function assignJobCustomer(access: Access, jobId: string, customerId: string) {
  return withStaffLock(access, "jobs.write", async (tx, actor) => {
    const [job, customer] = await Promise.all([
      tx.job.findFirst({ where: { id: jobId, workspaceId: actor.workspaceId }, include: { quote: true } }),
      tx.customer.findFirst({ where: { id: customerId, workspaceId: actor.workspaceId } }),
    ]);
    if (!job || !customer) throw new UserError("Job or customer not found.");
    if (job.quote) throw new UserError("This job already has a quote.");
    await tx.job.update({ where: { id: job.id }, data: { customerId } });
  });
}

async function createDraftQuote(tx: Tx, actor: Actor, workspace: Workspace, customerId: string, lines: DocumentLine[], extra: { jobId?: string; dueDate?: IsoDate }) {
  const customer = await tx.customer.findFirst({ where: { id: customerId, workspaceId: actor.workspaceId } });
  if (!customer) throw new UserError("Customer not found.");
  const placeOfSupply = customer.stateCode ?? workspace.stateCode;
  const totals = totalsFor(lines, workspace, placeOfSupply);
  const quote = await tx.quote.create({ data: { workspaceId: actor.workspaceId, customerId, jobId: extra.jobId, placeOfSupply, subtotalPaise: totals.subtotal, taxPaise: totals.tax, totalPaise: totals.total, linesJson: lines as unknown as Prisma.InputJsonValue, dueDate: extra.dueDate ? dateOnly(extra.dueDate) : null } });
  await logActivity(tx, actor, `Draft quote started for ${customer.name}`);
  return quote;
}

/** A job becomes an editable draft; parsed values are only a starting point for review. */
export function createQuoteFromJob(access: Access, jobId: string) {
  return withStaffLock(access, "quotes.draft", async (tx, actor) => {
    const job = await tx.job.findFirst({ where: { id: jobId, workspaceId: actor.workspaceId }, include: { quote: true } });
    if (!job) throw new UserError("Job not found.");
    if (job.quote) return job.quote;
    if (!job.customerId) throw new UserError("Choose the customer for this job first.");
    const workspace = await loadWorkspace(tx, actor.workspaceId);
    const parsed = job.parsedJson as ParsedJobNote | null;
    const lines = defaultLines(parsed, workspace);
    return createDraftQuote(tx, actor, workspace, job.customerId, lines.length ? lines : [{ description: "", quantity: 1, unitPrice: 0, taxRate: workspace.defaultTaxRate, code: workspace.defaultCode ?? undefined }], { jobId: job.id, dueDate: parsed?.dueDate });
  });
}

export function createBlankQuote(access: Access, customerId: string) {
  return withStaffLock(access, "quotes.draft", async (tx, actor) => {
    const workspace = await loadWorkspace(tx, actor.workspaceId);
    return createDraftQuote(tx, actor, workspace, customerId, [{ description: "", quantity: 1, unitPrice: 0, taxRate: workspace.defaultTaxRate, code: workspace.defaultCode ?? undefined }], {});
  });
}

function draftData(input: z.output<typeof draftInputSchema>, workspace: Workspace, placeOfSupply: string | null) {
  const lines = toDocumentLines(input.lines);
  const pos = input.placeOfSupply ?? placeOfSupply ?? workspace.stateCode;
  ensureValid(lines, workspace, workspaceMode(workspace, pos), false);
  const totals = totalsFor(lines, workspace, pos);
  return { lines, pos, totals };
}

export function saveQuoteDraft(access: Access, raw: DraftInput) {
  const input = draftInputSchema.parse(raw);
  return withStaffLock(access, "quotes.draft", async (tx, actor) => {
    const quote = await tx.quote.findFirst({ where: { id: input.id, workspaceId: actor.workspaceId } });
    if (!quote) throw new UserError("Quote not found.");
    if (quote.status !== "DRAFT") throw new UserError("Only draft quotes can be edited.");
    const workspace = await loadWorkspace(tx, actor.workspaceId);
    const { lines, pos, totals } = draftData(input, workspace, quote.placeOfSupply);
    const changed = await tx.quote.updateMany({
      where: { id: quote.id, workspaceId: actor.workspaceId, status: "DRAFT", version: input.version },
      data: { linesJson: lines as unknown as Prisma.InputJsonValue, placeOfSupply: pos, dueDate: input.dueDate ? dateOnly(input.dueDate) : null, subtotalPaise: totals.subtotal, taxPaise: totals.tax, totalPaise: totals.total, version: { increment: 1 } },
    });
    if (changed.count !== 1) throw new ConflictError();
  });
}

/** DRAFT -> SENT allocates the quote number; SENT -> ACCEPTED/REJECTED. Every move is a conditional update. */
export function moveQuote(access: Access, quoteId: string, to: Exclude<QuoteStatus, "DRAFT" | "INVOICED">) {
  return withStaffLock(access, "quotes.decide", async (tx, actor) => {
    const quote = await tx.quote.findFirst({ where: { id: quoteId, workspaceId: actor.workspaceId }, include: { invoice: { select: { id: true } } } });
    if (!quote) throw new UserError("Quote not found.");
    if (quote.invoice || !canMoveQuote(quote.status, to)) throw new UserError(`A ${quote.status.toLowerCase()} quote cannot be marked ${to.toLowerCase()}.`);
    const workspace = await loadWorkspace(tx, actor.workspaceId);
    if (to === "SENT") ensureValid(storedLines(quote.linesJson), workspace, workspaceMode(workspace, quote.placeOfSupply), false);
    const number = to === "SENT" && !quote.number ? await allocateNumber(tx, workspace, "QUOTE", businessDate()) : quote.number;
    const changed = await tx.quote.updateMany({ where: { id: quote.id, status: quote.status, version: quote.version }, data: { status: to, number, version: { increment: 1 } } });
    if (changed.count !== 1) throw new ConflictError();
    await logActivity(tx, actor, `Quote ${number} marked ${to.toLowerCase()}`);
    return { number };
  });
}

/** One transaction: ACCEPTED -> INVOICED and a draft invoice copied from the quote. A repeat returns the same invoice. */
export function convertQuote(access: Access, quoteId: string) {
  return withStaffLock(access, "invoices.write", async (tx, actor) => {
    const quote = await tx.quote.findFirst({ where: { id: quoteId, workspaceId: actor.workspaceId }, include: { invoice: true } });
    if (!quote) throw new UserError("Quote not found.");
    if (quote.invoice) return quote.invoice;
    if (quote.status !== "ACCEPTED") throw new UserError("Only accepted quotes can be converted to invoices.");
    const changed = await tx.quote.updateMany({ where: { id: quote.id, status: "ACCEPTED" }, data: { status: "INVOICED", version: { increment: 1 } } });
    if (changed.count !== 1) throw new ConflictError();
    const invoice = await tx.invoice.create({ data: { workspaceId: actor.workspaceId, customerId: quote.customerId, quoteId: quote.id, subtotalPaise: quote.subtotalPaise, taxPaise: quote.taxPaise, totalPaise: quote.totalPaise, linesJson: quote.linesJson as Prisma.InputJsonValue, placeOfSupply: quote.placeOfSupply, dueDate: quote.dueDate } });
    await logActivity(tx, actor, `Draft invoice started from quote ${quote.number}`);
    return invoice;
  });
}

export function createBlankInvoice(access: Access, customerId: string) {
  return withStaffLock(access, "invoices.write", async (tx, actor) => {
    const [workspace, customer] = await Promise.all([loadWorkspace(tx, actor.workspaceId), tx.customer.findFirst({ where: { id: customerId, workspaceId: actor.workspaceId } })]);
    if (!customer) throw new UserError("Customer not found.");
    const lines: DocumentLine[] = [{ description: "", quantity: 1, unitPrice: 0, taxRate: workspace.defaultTaxRate, code: workspace.defaultCode ?? undefined }];
    const invoice = await tx.invoice.create({ data: { workspaceId: actor.workspaceId, customerId, placeOfSupply: customer.stateCode ?? workspace.stateCode, subtotalPaise: 0, taxPaise: 0, totalPaise: 0, linesJson: lines as unknown as Prisma.InputJsonValue } });
    await logActivity(tx, actor, `Draft invoice started for ${customer.name}`);
    return invoice;
  });
}

export function saveInvoiceDraft(access: Access, raw: DraftInput) {
  const input = draftInputSchema.parse(raw);
  return withStaffLock(access, "invoices.write", async (tx, actor) => {
    const invoice = await tx.invoice.findFirst({ where: { id: input.id, workspaceId: actor.workspaceId } });
    if (!invoice) throw new UserError("Invoice not found.");
    if (invoice.status !== "DRAFT") throw new UserError("An issued invoice cannot be edited. Issue a credit note instead.");
    const workspace = await loadWorkspace(tx, actor.workspaceId);
    const { lines, pos, totals } = draftData(input, workspace, invoice.placeOfSupply);
    const changed = await tx.invoice.updateMany({
      where: { id: invoice.id, workspaceId: actor.workspaceId, status: "DRAFT", version: input.version },
      data: { linesJson: lines as unknown as Prisma.InputJsonValue, placeOfSupply: pos, paymentTerms: input.paymentTerms ?? null, dueDate: input.dueDate ? dateOnly(input.dueDate) : null, subtotalPaise: totals.subtotal, cgstPaise: totals.cgst, sgstPaise: totals.sgst, igstPaise: totals.igst, taxPaise: totals.tax, totalPaise: totals.total, version: { increment: 1 } },
    });
    if (changed.count !== 1) throw new ConflictError();
  });
}

export type SellerSnapshot = { legalName: string; tradeName: string; address: string; stateCode: string | null; gstin: string | null; gstScheme: string; upiId: string | null; legacy?: boolean };
export type BuyerSnapshot = { name: string; address: string | null; stateCode: string | null; gstin: string | null; phone: string; email: string | null; legacy?: boolean };

/** What blocks issuing, in words a shop owner can act on. */
export function sellerProblems(workspace: Workspace): string[] {
  const problems: string[] = [];
  if (!workspace.gstScheme) problems.push("Choose your GST registration type in Settings.");
  if (!workspace.legalName || !workspace.address || !workspace.stateCode) problems.push("Add your legal name, address and state in Settings.");
  if (workspace.gstScheme && workspace.gstScheme !== "UNREGISTERED" && (!workspace.gstin || !isValidGstin(workspace.gstin))) problems.push("Add a valid GSTIN in Settings.");
  if (workspace.gstScheme === "REGULAR" && workspace.stateCode && UTGST_STATES.has(workspace.stateCode)) problems.push("UTGST invoices are not supported yet for your territory.");
  return problems;
}

/**
 * DRAFT -> SENT inside the caller's lock: validates, recalculates on the server, freezes seller and buyer
 * identity and the calculated lines, and allocates the Rule 46 number. Used by "Issue" and by cash-on-draft.
 */
export async function issueInTx(tx: Tx, actor: Actor, invoice: Invoice, expectedVersion = invoice.version) {
  if (invoice.status !== "DRAFT") throw new UserError("This invoice is already issued.");
  const [workspace, customer] = await Promise.all([loadWorkspace(tx, actor.workspaceId), tx.customer.findUniqueOrThrow({ where: { id: invoice.customerId } })]);
  const problems = sellerProblems(workspace);
  if (problems.length) throw new UserError(problems.join(" "));
  const placeOfSupply = invoice.placeOfSupply ?? customer.stateCode ?? workspace.stateCode;
  const mode = workspaceMode(workspace, placeOfSupply);
  const lines = storedLines(invoice.linesJson);
  ensureValid(lines, workspace, mode, true);
  const totals = calculateDocument(lines, mode);
  const issueDate = businessDate();
  const number = await allocateNumber(tx, workspace, "INVOICE", issueDate);
  const seller: SellerSnapshot = { legalName: workspace.legalName!, tradeName: workspace.brandName, address: workspace.address!, stateCode: workspace.stateCode, gstin: workspace.gstScheme === "UNREGISTERED" ? null : workspace.gstin, gstScheme: workspace.gstScheme!, upiId: workspace.upiId };
  const buyer: BuyerSnapshot = { name: customer.name, address: customer.address, stateCode: customer.stateCode, gstin: customer.gstin, phone: customer.phone, email: customer.email };
  const changed = await tx.invoice.updateMany({
    where: { id: invoice.id, workspaceId: actor.workspaceId, status: "DRAFT", version: expectedVersion },
    data: {
      status: "SENT", number, documentType: mode === "NONE" ? "BILL_OF_SUPPLY" : "TAX_INVOICE", placeOfSupply,
      linesJson: totals.lines as unknown as Prisma.InputJsonValue, subtotalPaise: totals.subtotal, cgstPaise: totals.cgst, sgstPaise: totals.sgst, igstPaise: totals.igst, taxPaise: totals.tax, totalPaise: totals.total,
      issueDate: dateOnly(issueDate), issuedAt: new Date(), issuedByUserId: actor.userId, dueDate: invoice.dueDate ?? dateOnly(issueDate),
      sellerSnapshot: seller as unknown as Prisma.InputJsonValue, buyerSnapshot: buyer as unknown as Prisma.InputJsonValue, version: { increment: 1 },
    },
  });
  if (changed.count !== 1) throw new ConflictError();
  await logActivity(tx, actor, `Invoice ${number} issued to ${customer.name}`);
  return tx.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
}

export function issueInvoice(access: Access, input: { id: string; version: number }) {
  return withStaffLock(access, "invoices.write", async (tx, actor) => {
    const invoice = await tx.invoice.findFirst({ where: { id: input.id, workspaceId: actor.workspaceId } });
    if (!invoice) throw new UserError("Invoice not found.");
    return issueInTx(tx, actor, invoice, input.version);
  });
}
