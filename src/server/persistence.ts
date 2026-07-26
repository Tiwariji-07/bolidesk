import { Prisma, PrismaClient, QuoteStatus } from "@prisma/client";
import { canTransitionInvoice } from "../domain/invoice";
import { localJobNoteParser } from "../domain/job-note";
import type { ParsedJobNote } from "../domain/job-note";
import { calculateQuoteTotals, type QuoteLine } from "../domain/quote";
import { getPrisma } from "./prisma";
import { hashPortalToken, newPortalToken } from "./portal";
import { publicAppUrl } from "./env";
import { createProviders } from "./integrations/providers";
import type { PaymentProvider } from "./integrations/types";

type Database = PrismaClient | Prisma.TransactionClient;
type CustomerInput = { name: string; phone: string; email?: string; address?: string };
type WorkspaceSettingsInput = { brandName: string; invoicePrefix: string; gstin?: string };
type JobInput = { note: string; customerId?: string };
type SavedJobParser = { parse(note: string): ParsedJobNote | Promise<ParsedJobNote> };
type FollowUpInput = { subject: string; action: string; dueAt: Date };
type PaymentRequestOptions = { paymentProvider?: PaymentProvider; appUrl?: string };

const asJson = (value: unknown) => value as Prisma.InputJsonValue;

function activityRepository(db: Database, workspaceId: string) {
  return {
    list: () => db.activity.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, take: 20 }),
    create: (body: string) => db.activity.create({ data: { workspaceId, body } }),
  };
}

function customerRepository(db: Database, workspaceId: string) {
  return {
    list: () => db.customer.findMany({
      where: { workspaceId }, orderBy: { createdAt: "desc" }, include: { _count: { select: { jobs: true } } },
    }),
    get: (id: string) => db.customer.findFirst({ where: { id, workspaceId } }),
    create: async (input: CustomerInput) => {
      const customer = await db.customer.create({ data: { workspaceId, ...input, email: input.email || null, address: input.address || null } });
      await activityRepository(db, workspaceId).create(`Customer ${customer.name} added`);
      return customer;
    },
    async update(id: string, input: Partial<CustomerInput>) {
      const result = await db.customer.updateMany({ where: { id, workspaceId }, data: input });
      if (result.count !== 1) throw new Error("Customer not found");
      const customer = await db.customer.findFirstOrThrow({ where: { id, workspaceId } });
      await activityRepository(db, workspaceId).create(`Customer ${customer.name} updated`);
      return customer;
    },
  };
}

function workspaceRepository(db: Database, workspaceId: string) {
  return {
    get: () => db.workspace.findFirst({ where: { id: workspaceId } }),
    async updateSettings(input: WorkspaceSettingsInput) {
      const result = await db.workspace.updateMany({ where: { id: workspaceId }, data: { ...input, gstin: input.gstin || null } });
      if (result.count !== 1) throw new Error("Workspace not found");
      await activityRepository(db, workspaceId).create("Workspace settings updated");
      return db.workspace.findFirstOrThrow({ where: { id: workspaceId } });
    },
  };
}

function jobRepository(db: Database, workspaceId: string) {
  return {
    list: () => db.job.findMany({ where: { workspaceId }, include: { customer: true, quote: true }, orderBy: { createdAt: "desc" } }),
    get: (id: string) => db.job.findFirst({ where: { id, workspaceId }, include: { customer: true } }),
    async parseAndSave(input: JobInput, parser: SavedJobParser = localJobNoteParser) {
      if (input.customerId) {
        const customer = await db.customer.findFirst({ where: { id: input.customerId, workspaceId } });
        if (!customer) throw new Error("Customer not found");
      }
      const parsed = await parser.parse(input.note);
      const job = await db.job.create({ data: { workspaceId, customerId: input.customerId, note: input.note, parsedJson: asJson(parsed) } });
      await activityRepository(db, workspaceId).create("Job note parsed and saved");
      return { job, parsed };
    },
  };
}

function nextNumber(prefix: string, count: number) {
  return `${prefix}-${String(1027 + count).padStart(4, "0")}`;
}

function quoteRepository(db: Database, workspaceId: string) {
  return {
    list: () => db.quote.findMany({ where: { workspaceId }, include: { customer: true, job: true, invoice: true }, orderBy: { createdAt: "desc" } }),
    get: (id: string) => db.quote.findFirst({ where: { id, workspaceId }, include: { customer: true, job: true, invoice: true } }),
    async createFromJob(jobId: string) {
      const job = await db.job.findFirst({ where: { id: jobId, workspaceId }, include: { quote: true } });
      if (!job) throw new Error("Job not found");
      if (job.quote) return job.quote;
      if (!job.customerId) throw new Error("Assign a customer before creating a quote");
      const parsed = job.parsedJson as { lines?: QuoteLine[]; dueDate?: string } | null;
      const lines = parsed?.lines ?? [];
      if (!lines.length) throw new Error("Add at least one parsed line before creating a quote");
      const totals = calculateQuoteTotals(lines);
      const count = await db.quote.count({ where: { workspaceId } });
      const quote = await db.quote.create({
        data: {
          workspaceId, customerId: job.customerId, jobId: job.id, number: nextNumber("QT", count),
          subtotal: totals.subtotal, tax: totals.tax, total: totals.total, linesJson: asJson(lines),
          dueDate: parsed?.dueDate ? new Date(`${parsed.dueDate}T00:00:00.000Z`) : null,
        },
      });
      await activityRepository(db, workspaceId).create(`Draft quote ${quote.number} created`);
      return quote;
    },
    async changeStatus(id: string, status: QuoteStatus) {
      const result = await db.quote.updateMany({ where: { id, workspaceId }, data: { status } });
      if (result.count !== 1) throw new Error("Quote not found");
      const quote = await db.quote.findFirstOrThrow({ where: { id, workspaceId } });
      await activityRepository(db, workspaceId).create(`Quote ${quote.number} marked ${status.toLowerCase()}`);
      return quote;
    },
  };
}

function invoiceRepository(db: Database, workspaceId: string) {
  return {
    list: () => db.invoice.findMany({ where: { workspaceId }, include: { customer: true, paymentRequests: true }, orderBy: { createdAt: "desc" } }),
    getByNumber: (number: string) => db.invoice.findFirst({ where: { workspaceId, number }, include: { customer: true, quote: true, paymentRequests: true } }),
    async convertAcceptedQuote(quoteId: string) {
      return (db as PrismaClient).$transaction(async (tx) => {
        const quote = await tx.quote.findFirst({ where: { id: quoteId, workspaceId }, include: { invoice: true } });
        if (!quote) throw new Error("Quote not found");
        if (quote.status !== "ACCEPTED") throw new Error("Only accepted quotes can be converted to invoices");
        if (quote.invoice) return quote.invoice;
        const workspace = await tx.workspace.findFirst({ where: { id: workspaceId } });
        if (!workspace) throw new Error("Workspace not found");
        const count = await tx.invoice.count({ where: { workspaceId } });
        const invoice = await tx.invoice.create({
          data: { workspaceId, customerId: quote.customerId, quoteId: quote.id, number: nextNumber(workspace.invoicePrefix, 1019 + count), status: "DRAFT", subtotal: quote.subtotal, tax: quote.tax, total: quote.total, dueDate: quote.dueDate, linesJson: asJson(quote.linesJson) },
        });
        await tx.activity.create({ data: { workspaceId, body: `Invoice ${invoice.number} created from ${quote.number}` } });
        return invoice;
      });
    },
    async createPaymentRequest(invoiceId: string, options: PaymentRequestOptions = {}) {
      const existing = await db.paymentRequest.findFirst({ where: { invoiceId, workspaceId }, orderBy: { createdAt: "desc" } });
      if (existing) return existing;
      const invoice = await db.invoice.findFirst({ where: { id: invoiceId, workspaceId }, include: { customer: true } });
      if (!invoice) throw new Error("Invoice not found");
      const reference = `PR-${invoice.number}-${Date.now().toString(36).toUpperCase()}`;
      const token = newPortalToken();
      const portalUrl = `${options.appUrl ?? publicAppUrl()}/p/${token}`;
      const paymentProvider = options.paymentProvider ?? createProviders().payments;
      const link = await paymentProvider.createPaymentLink({ reference, amount: invoice.total, description: `Invoice ${invoice.number}`, customerName: invoice.customer.name, customerPhone: invoice.customer.phone, callbackUrl: portalUrl });
      return (db as PrismaClient).$transaction(async (tx) => {
        const raced = await tx.paymentRequest.findFirst({ where: { invoiceId: invoice.id, workspaceId }, orderBy: { createdAt: "desc" } });
        if (raced) return raced;
        await tx.customerPortalToken.create({ data: { workspaceId, customerId: invoice.customerId, invoiceId: invoice.id, tokenHash: hashPortalToken(token), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } });
        const request = await tx.paymentRequest.create({ data: { workspaceId, invoiceId: invoice.id, reference, amount: invoice.total, url: link.url, provider: paymentProvider.name === "razorpay" ? "RAZORPAY" : "DEMO", providerPaymentLinkId: link.id } });
        await tx.invoice.updateMany({ where: { id: invoice.id, workspaceId }, data: { paymentUrl: link.url, status: invoice.status === "DRAFT" ? "SENT" : invoice.status } });
        await tx.activity.create({ data: { workspaceId, body: `Payment request prepared for ${invoice.number}` } });
        return request;
      });
    },
    async markPaid(invoiceId: string) {
      return (db as PrismaClient).$transaction(async (tx) => {
        const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, workspaceId } });
        if (!invoice) throw new Error("Invoice not found");
        if (invoice.status === "PAID") return invoice;
        if (!canTransitionInvoice(invoice.status, "PAID")) throw new Error("Invoice cannot be marked paid from its current status");
        const result = await tx.invoice.updateMany({ where: { id: invoiceId, workspaceId }, data: { status: "PAID", paidAt: new Date() } });
        if (result.count !== 1) throw new Error("Invoice not found");
        const paid = await tx.invoice.findFirstOrThrow({ where: { id: invoiceId, workspaceId } });
        await tx.activity.create({ data: { workspaceId, body: `Invoice ${paid.number} marked paid` } });
        return paid;
      });
    },
  };
}

function portalTokenRepository(db: Database, workspaceId: string) {
  const create = async (target: { customerId: string; invoiceId?: string; quoteId?: string }) => {
    const token = newPortalToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await db.customerPortalToken.create({ data: { workspaceId, ...target, tokenHash: hashPortalToken(token), expiresAt } });
    return { token, expiresAt, url: `${publicAppUrl()}/p/${token}` };
  };
  return {
    async createForInvoice(invoiceId: string) {
      const invoice = await db.invoice.findFirst({ where: { id: invoiceId, workspaceId } });
      if (!invoice) throw new Error("Invoice not found");
      return create({ customerId: invoice.customerId, invoiceId: invoice.id });
    },
    async createForQuote(quoteId: string) {
      const quote = await db.quote.findFirst({ where: { id: quoteId, workspaceId } });
      if (!quote) throw new Error("Quote not found");
      return create({ customerId: quote.customerId, quoteId: quote.id });
    },
  };
}

function followUpRepository(db: Database, workspaceId: string) {
  return {
    list: () => db.followUp.findMany({ where: { workspaceId }, orderBy: [{ status: "asc" }, { dueAt: "asc" }] }),
    async create(input: FollowUpInput) {
      const followUp = await db.followUp.create({ data: { workspaceId, ...input } });
      await activityRepository(db, workspaceId).create(`Follow-up created: ${followUp.subject}`);
      return followUp;
    },
    async snooze(id: string, until: Date) {
      const result = await db.followUp.updateMany({ where: { id, workspaceId, status: { not: "DONE" } }, data: { status: "SNOOZED", snoozedUntil: until, dueAt: until } });
      if (result.count !== 1) throw new Error("Follow-up not found");
      const followUp = await db.followUp.findFirstOrThrow({ where: { id, workspaceId } });
      await activityRepository(db, workspaceId).create(`Follow-up snoozed: ${followUp.subject}`);
      return followUp;
    },
    async complete(id: string) {
      const result = await db.followUp.updateMany({ where: { id, workspaceId, status: { not: "DONE" } }, data: { status: "DONE" } });
      if (result.count !== 1) throw new Error("Follow-up not found");
      const followUp = await db.followUp.findFirstOrThrow({ where: { id, workspaceId } });
      await activityRepository(db, workspaceId).create(`Follow-up completed: ${followUp.subject}`);
      return followUp;
    },
  };
}

/** Tenant seam: all callers obtain a workspace-scoped collection of repositories here. */
export function forWorkspace(workspaceId: string, db?: Database) {
  const client = db ?? getPrisma();
  return {
    workspace: workspaceRepository(client, workspaceId),
    customers: customerRepository(client, workspaceId),
    jobs: jobRepository(client, workspaceId),
    quotes: quoteRepository(client, workspaceId),
    invoices: invoiceRepository(client, workspaceId),
    portalTokens: portalTokenRepository(client, workspaceId),
    followUps: followUpRepository(client, workspaceId),
    activities: activityRepository(client, workspaceId),
  };
}
