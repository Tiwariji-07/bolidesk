import { randomBytes } from "node:crypto";
import type { PaymentMethod } from "@prisma/client";
import { z } from "zod";
import { businessDate } from "@/domain/business-time";
import { balanceOf, settledStatus, type Balance } from "@/domain/documents";
import { parseRupees } from "@/domain/money";
import { formatINR } from "@/lib/format";
import type { Access } from "./access";
import { allocateNumber, issueInTx } from "./billing";
import { publicAppUrl } from "./env";
import { ConflictError, UserError } from "./errors";
import { ProviderRejectedError, type PaymentProvider, type ProviderPayment } from "./integrations/types";
import { createPortalToken, PORTAL_LIFETIME_MS } from "./portal";
import { logActivity, withStaffLock, withSystemLock, type Actor, type Tx } from "./workspace-tx";

const LIVE = ["PENDING", "ACTIVE", "CANCELLING"] as const;
/** Requests closed by the ledger migration: their payments may already be in a LEGACY opening entry. */
const LEGACY_MARKER = "legacy:";

/** Credit notes reduce what is owed. */
export async function creditedPaise(tx: Tx, invoiceId: string) {
  const result = await tx.creditNote.aggregate({ where: { invoiceId }, _sum: { totalPaise: true } });
  return result._sum.totalPaise ?? 0;
}

async function balanceInTx(tx: Tx, invoiceId: string, totalPaise: number): Promise<Balance> {
  const paid = await tx.payment.aggregate({ where: { invoiceId }, _sum: { amountPaise: true } }); const credited = await creditedPaise(tx, invoiceId);
  return balanceOf(totalPaise, credited, paid._sum.amountPaise ?? 0);
}

/**
 * After any ledger or credit change: derive the status from the balance, close or reopen the invoice's
 * automatic follow-up, and mark a live payment link stale if it no longer asks for the amount due. Returns links to cancel after commit.
 */
export async function settleInTx(tx: Tx, invoiceId: string): Promise<{ balance: Balance; staleRequestIds: string[] }> {
  const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  const balance = await balanceInTx(tx, invoiceId, invoice.totalPaise);
  const status = settledStatus(invoice.status, balance);
  if (status !== invoice.status) {
    await tx.invoice.update({ where: { id: invoiceId }, data: { status, paidAt: status === "PAID" ? invoice.paidAt ?? new Date() : null, version: { increment: 1 } } });
  }
  if (balance.due === 0) await tx.followUp.updateMany({ where: { invoiceId, status: { in: ["OPEN", "SNOOZED"] } }, data: { status: "DONE", completedAutomatically: true } });
  // A reversal that leaves money owed reopens the reminder a payment had closed.
  else await tx.followUp.updateMany({ where: { invoiceId, status: "DONE", completedAutomatically: true }, data: { status: "OPEN", completedAutomatically: false } });
  const live = await tx.paymentRequest.findMany({ where: { invoiceId, status: { in: ["PENDING", "ACTIVE"] } } });
  const stale = live.filter((request) => request.amountPaise !== balance.due);
  if (stale.length) await tx.paymentRequest.updateMany({ where: { id: { in: stale.map((request) => request.id) } }, data: { status: "CANCELLING" } });
  return { balance, staleRequestIds: stale.map((request) => request.id) };
}

export const paymentInputSchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.string().trim().min(1, "Enter the amount received."),
  method: z.enum(["CASH", "UPI", "CARD", "BANK"]),
  reference: z.string().trim().max(120).optional().transform((value) => value || null),
  idempotencyKey: z.string().min(8).max(64),
  /** For cash on a draft: the draft version on screen, so a draft changed by someone else is not issued unseen. */
  draftVersion: z.number().int().min(0).optional(),
});

/** Money received at the counter or by direct transfer. Cash may close a draft (it is issued first); others need an issued invoice. */
export async function recordPayment(access: Access, raw: z.input<typeof paymentInputSchema>, provider?: PaymentProvider) {
  const input = paymentInputSchema.parse(raw);
  const amount = parseRupees(input.amount);
  if (!amount) throw new UserError("Enter the amount received, like 650 or 1,250.50.");
  if (input.method !== "CASH" && !input.reference) throw new UserError("Add the UPI/bank reference so the payment can be traced.");
  const result = await withStaffLock(access, input.method === "CASH" ? "payments.cash" : "payments.manual", async (tx, actor) => {
    const existing = await tx.payment.findUnique({ where: { workspaceId_idempotencyKey: { workspaceId: actor.workspaceId, idempotencyKey: input.idempotencyKey } } });
    if (existing) {
      if (existing.invoiceId !== input.invoiceId || existing.amountPaise !== amount || existing.method !== input.method) throw new ConflictError("This form was already used for a different payment. Reload and try again.");
      const stuck = await tx.paymentRequest.findMany({ where: { invoiceId: existing.invoiceId, status: "CANCELLING" }, select: { id: true } });
      return { payment: existing, staleRequestIds: stuck.map((request) => request.id), balance: await balanceInTx(tx, existing.invoiceId, (await tx.invoice.findUniqueOrThrow({ where: { id: existing.invoiceId } })).totalPaise) };
    }
    let invoice = await tx.invoice.findFirst({ where: { id: input.invoiceId, workspaceId: actor.workspaceId } });
    if (!invoice) throw new UserError("Invoice not found.");
    if (invoice.status === "CREDITED") throw new UserError("This invoice was cancelled with a credit note.");
    if (invoice.status === "DRAFT") {
      if (input.method !== "CASH") throw new UserError("Issue the invoice before recording a UPI, card or bank payment.");
      if (input.draftVersion === undefined) throw new UserError("Reload the invoice and try again.");
      invoice = await issueInTx(tx, actor, invoice, input.draftVersion);
    }
    const before = await balanceInTx(tx, invoice.id, invoice.totalPaise);
    if (amount > before.due) throw new UserError(`Only ${formatINR(before.due)} is due on this invoice.`);
    const receiptNumber = await allocateNumber(tx, await tx.workspace.findUniqueOrThrow({ where: { id: actor.workspaceId } }), "RECEIPT", businessDate());
    const payment = await tx.payment.create({ data: { workspaceId: actor.workspaceId, invoiceId: invoice.id, entryKind: "RECEIPT", source: "MANUAL", amountPaise: amount, method: input.method as PaymentMethod, reference: input.reference, receiptNumber, idempotencyKey: input.idempotencyKey, recordedByUserId: actor.userId } });
    const settled = await settleInTx(tx, invoice.id);
    await logActivity(tx, actor, `${formatINR(amount)} ${input.method.toLowerCase()} received for ${invoice.number} (receipt ${receiptNumber})`);
    return { payment, ...settled };
  });
  if (provider) await cancelStaleRequests(access.workspaceId, result.staleRequestIds, provider);
  return { receiptNumber: result.payment.receiptNumber, paymentId: result.payment.id, duePaise: result.balance.due };
}

/** Owner only: undo a mistaken manual receipt with an exact negative entry. Ledger rows are never edited or deleted. */
export async function reversePayment(access: Access, paymentId: string, reason: string, provider?: PaymentProvider) {
  if (reason.trim().length < 3) throw new UserError("Say why this receipt is being reversed.");
  const result = await withStaffLock(access, "payments.correct", async (tx, actor) => {
    const payment = await tx.payment.findFirst({ where: { id: paymentId, workspaceId: actor.workspaceId }, include: { reversal: true, invoice: { select: { number: true } } } });
    if (!payment || payment.entryKind !== "RECEIPT") throw new UserError("Receipt not found.");
    if (payment.source !== "MANUAL") throw new UserError("Online payments cannot be reversed. Record a refund after returning the money.");
    if (payment.reversal) throw new UserError("This receipt was already reversed.");
    const net = await tx.payment.aggregate({ where: { invoiceId: payment.invoiceId }, _sum: { amountPaise: true } });
    if ((net._sum.amountPaise ?? 0) - payment.amountPaise < 0) throw new UserError("This money was already refunded, so the receipt cannot be reversed as well.");
    await tx.payment.create({ data: { workspaceId: actor.workspaceId, invoiceId: payment.invoiceId, entryKind: "REVERSAL", source: "MANUAL", amountPaise: -payment.amountPaise, method: payment.method, reversesPaymentId: payment.id, idempotencyKey: `reversal-${payment.id}`, recordedByUserId: actor.userId, reason: reason.trim() } });
    const settled = await settleInTx(tx, payment.invoiceId);
    await logActivity(tx, actor, `Receipt ${payment.receiptNumber} reversed on ${payment.invoice.number}: ${reason.trim()}`);
    return settled;
  });
  if (provider) await cancelStaleRequests(access.workspaceId, result.staleRequestIds, provider);
}

/** Owner only, after the money has actually gone back to the customer. Limited to what was overpaid or credited. */
export function recordRefund(access: Access, input: { invoiceId: string; amount: string; method: Exclude<PaymentMethod, "RAZORPAY">; reference: string; reason: string; idempotencyKey: string }) {
  const amount = parseRupees(input.amount);
  if (!amount) throw new UserError("Enter the amount refunded.");
  if (input.reason.trim().length < 3) throw new UserError("Say why the money was refunded.");
  return withStaffLock(access, "payments.correct", async (tx, actor) => {
    const existing = await tx.payment.findUnique({ where: { workspaceId_idempotencyKey: { workspaceId: actor.workspaceId, idempotencyKey: `refund-${input.idempotencyKey}` } } });
    if (existing) {
      if (existing.invoiceId !== input.invoiceId || existing.amountPaise !== -amount) throw new ConflictError("This form was already used for a different refund. Reload and try again.");
      return;
    }
    const invoice = await tx.invoice.findFirst({ where: { id: input.invoiceId, workspaceId: actor.workspaceId } });
    if (!invoice) throw new UserError("Invoice not found.");
    const balance = await balanceInTx(tx, invoice.id, invoice.totalPaise);
    if (amount > balance.refundDue) throw new UserError(`Only ${formatINR(balance.refundDue)} can be refunded on this invoice.`);
    await tx.payment.create({ data: { workspaceId: actor.workspaceId, invoiceId: invoice.id, entryKind: "REFUND", source: "MANUAL", amountPaise: -amount, method: input.method, reference: input.reference.trim() || null, idempotencyKey: `refund-${input.idempotencyKey}`, recordedByUserId: actor.userId, reason: input.reason.trim() } });
    await settleInTx(tx, invoice.id);
    await logActivity(tx, actor, `${formatINR(amount)} refunded on ${invoice.number}: ${input.reason.trim()}`);
  });
}

/**
 * Records one provider payment exactly once (unique provider payment id), under the workspace lock.
 * Captured INR money is always recorded, even after the invoice is settled; the balance then shows a refund due.
 */
async function applyProviderPayment(tx: Tx, actor: Actor, requestId: string, payment: ProviderPayment) {
  const request = await tx.paymentRequest.findUniqueOrThrow({ where: { id: requestId }, include: { invoice: { select: { id: true, number: true } } } });
  const existing = await tx.payment.findUnique({ where: { providerPaymentId: payment.id } });
  if (existing) {
    if (existing.invoiceId !== request.invoiceId || existing.amountPaise !== payment.amount) throw new Error(`Razorpay payment ${payment.id} conflicts with an existing ledger entry.`);
    return { recorded: false, staleRequestIds: [] as string[] };
  }
  if (payment.status !== "captured") return { recorded: false, staleRequestIds: [] as string[] };
  // Hold only when the invoice's earlier PAID status is already in the ledger as an opening entry; otherwise the money is new.
  const opening = request.lastError?.startsWith(LEGACY_MARKER) ? await tx.payment.findFirst({ where: { invoiceId: request.invoiceId, source: "LEGACY" }, select: { id: true } }) : null;
  if (opening) {
    await logActivity(tx, actor, `Razorpay payment ${payment.id} (${formatINR(payment.amount)}) arrived on a link from before the payments ledger for ${request.invoice.number}. Not recorded automatically: check it against the earlier paid status.`);
    return { recorded: false, staleRequestIds: [] as string[] };
  }
  if (payment.currency !== "INR" || payment.amount <= 0 || payment.amount > request.amountPaise) {
    await logActivity(tx, actor, `Razorpay payment ${payment.id} on ${request.invoice.number} needs review: ${payment.currency} ${payment.amount} paise against a ${request.amountPaise} paise link. Not recorded.`);
    return { recorded: false, staleRequestIds: [] as string[] };
  }
  const receiptNumber = await allocateNumber(tx, await tx.workspace.findUniqueOrThrow({ where: { id: request.workspaceId } }), "RECEIPT", businessDate(payment.createdAt ? new Date(payment.createdAt * 1000) : new Date()));
  // Booked at Razorpay's payment time, so a 23:55 payment whose webhook arrives after midnight stays on its own day.
  const occurredAt = payment.createdAt ? new Date(payment.createdAt * 1000) : new Date();
  await tx.payment.create({ data: { workspaceId: request.workspaceId, invoiceId: request.invoiceId, paymentRequestId: request.id, entryKind: "RECEIPT", source: "RAZORPAY", method: "RAZORPAY", amountPaise: payment.amount, providerPaymentId: payment.id, receiptNumber, idempotencyKey: `razorpay-${payment.id}`, occurredAt } });
  const settled = await settleInTx(tx, request.invoiceId);
  await logActivity(tx, actor, `${formatINR(payment.amount)} received online for ${request.invoice.number} (receipt ${receiptNumber})`);
  return { recorded: true, staleRequestIds: settled.staleRequestIds };
}

async function importProviderPayments(workspaceId: string, requestId: string, payments: ProviderPayment[]) {
  if (!payments.some((payment) => payment.status === "captured")) return;
  await withSystemLock(workspaceId, async (tx, actor) => {
    for (const payment of payments) await applyProviderPayment(tx, actor, requestId, payment);
  });
}

/** Cancels links that ask for the wrong amount. Payments already made on them are imported first, so no money is lost. */
export async function cancelStaleRequests(workspaceId: string, requestIds: string[], provider: PaymentProvider) {
  for (const requestId of requestIds) {
    const request = await withSystemLock(workspaceId, (tx) => tx.paymentRequest.findUnique({ where: { id: requestId } }));
    if (!request || request.status !== "CANCELLING") continue;
    // Demo links never existed anywhere else; close them here, including after switching to live mode.
    if (request.provider === "DEMO") {
      await withSystemLock(workspaceId, (tx) => tx.paymentRequest.updateMany({ where: { id: request.id, status: "CANCELLING" }, data: { status: "CANCELLED" } }));
      continue;
    }
    if (provider.name !== "razorpay") continue;
    try {
      // The list-by-reference answer may omit payments, so always read the link itself before deciding.
      const found = request.providerPaymentLinkId ? null : await provider.findPaymentLink(request.reference);
      const linkId = request.providerPaymentLinkId ?? found?.id;
      let state = linkId ? await provider.fetchPaymentLink(linkId) : null;
      if (state) {
        await importProviderPayments(workspaceId, request.id, state.payments);
        if (state.status === "created" || state.status === "partially_paid") {
          await provider.cancelPaymentLink(state.id);
          state = await provider.fetchPaymentLink(state.id);
          await importProviderPayments(workspaceId, request.id, state.payments);
        }
      }
      const final = !state ? "CANCELLED" : state.status === "paid" ? "PAID" : state.status === "expired" ? "EXPIRED" : state.status === "cancelled" ? "CANCELLED" : null;
      if (!final) continue;
      await withSystemLock(workspaceId, (tx) => tx.paymentRequest.updateMany({ where: { id: request.id, status: "CANCELLING" }, data: { status: final, providerPaymentLinkId: state?.id ?? request.providerPaymentLinkId } }));
    } catch (error) {
      // Stays CANCELLING; the partial unique index keeps a second link from being created until this resolves.
      await withSystemLock(workspaceId, (tx) => tx.paymentRequest.update({ where: { id: request.id }, data: { lastError: error instanceof Error ? error.message.slice(0, 300) : "Cancel failed" } }));
    }
  }
}

/** Staff retry for a link that could not be cancelled (for example Razorpay was down when cash was recorded). */
export async function retryStuckRequests(access: Access, invoiceId: string, provider: PaymentProvider) {
  const stuck = await withStaffLock(access, "payments.request", (tx, actor) => tx.paymentRequest.findMany({ where: { workspaceId: actor.workspaceId, invoiceId, status: { in: ["CANCELLING", "PENDING"] } }, select: { id: true, status: true } }));
  for (const request of stuck) {
    if (request.status === "PENDING") await reconcilePending(access.workspaceId, request.id, provider);
    else await cancelStaleRequests(access.workspaceId, [request.id], provider);
  }
  return withStaffLock(access, "payments.request", (tx) => tx.paymentRequest.count({ where: { invoiceId, status: { in: ["CANCELLING", "PENDING"] } } }));
}

/** Finishes a PENDING request whose provider call timed out: attach the link if Razorpay made one, otherwise mark it failed. */
async function reconcilePending(workspaceId: string, requestId: string, provider: PaymentProvider) {
  const request = await withSystemLock(workspaceId, (tx) => tx.paymentRequest.findUnique({ where: { id: requestId } }));
  if (!request || request.status !== "PENDING") return;
  const found = provider.name === "demo" ? null : await provider.findPaymentLink(request.reference);
  const state = found ? await provider.fetchPaymentLink(found.id) : null;
  if (state) await importProviderPayments(workspaceId, request.id, state.payments);
  await withSystemLock(workspaceId, async (tx) => {
    if (state) return tx.paymentRequest.updateMany({ where: { id: request.id, status: "PENDING" }, data: { status: "CANCELLING", providerPaymentLinkId: state.id, url: state.url } });
    if (Date.now() - request.createdAt.getTime() > 2 * 60_000) return tx.paymentRequest.updateMany({ where: { id: request.id, status: "PENDING" }, data: { status: "FAILED" } });
  });
  // A recovered link is not trusted to still match the balance: cancel it and let the caller create a fresh one.
  if (state) await cancelStaleRequests(workspaceId, [request.id], provider);
}

export type PaymentLinkResult = { url: string | null; portalUrl: string; demo: boolean };

/**
 * Three steps so a timeout can never leave an untracked link: reserve a PENDING row (with its reference and expiry)
 * under the lock, call the provider outside it, then activate under the lock only if the amount is still right.
 */
export async function createPaymentRequest(access: Access, invoiceId: string, provider: PaymentProvider): Promise<PaymentLinkResult> {
  for (let round = 0; round < 3; round += 1) {
    const step = await withStaffLock(access, "payments.request", async (tx, actor) => {
      const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, workspaceId: actor.workspaceId }, include: { customer: true } });
      if (!invoice) throw new UserError("Invoice not found.");
      if (invoice.status !== "SENT") throw new UserError(invoice.status === "DRAFT" ? "Issue the invoice before asking for payment." : "Nothing is due on this invoice.");
      const balance = await balanceInTx(tx, invoice.id, invoice.totalPaise);
      if (balance.due <= 0) throw new UserError("Nothing is due on this invoice.");
      const live = await tx.paymentRequest.findFirst({ where: { invoiceId: invoice.id, status: { in: [...LIVE] } } });
      if (live?.status === "ACTIVE" && live.amountPaise === balance.due && live.expiresAt && live.expiresAt.getTime() > Date.now() + 60 * 60_000) {
        const portal = await createPortalToken(tx, { workspaceId: actor.workspaceId, customerId: invoice.customerId, invoiceId: invoice.id, expiresAt: live.expiresAt });
        return { kind: "ready" as const, url: live.url, portalUrl: portal.url };
      }
      if (live?.status === "PENDING") return { kind: "reconcile" as const, requestId: live.id };
      if (live) {
        await tx.paymentRequest.updateMany({ where: { id: live.id, status: { in: ["ACTIVE", "CANCELLING"] } }, data: { status: "CANCELLING" } });
        return { kind: "cancel" as const, requestId: live.id };
      }
      const expiresAt = new Date(Math.floor((Date.now() + PORTAL_LIFETIME_MS) / 1000) * 1000);
      const reference = `PR${Date.now().toString(36)}${randomBytes(6).toString("hex")}`.toUpperCase();
      const request = await tx.paymentRequest.create({ data: { workspaceId: actor.workspaceId, invoiceId: invoice.id, reference, provider: provider.name === "razorpay" ? "RAZORPAY" : "DEMO", amountPaise: balance.due, expiresAt, createdByUserId: actor.userId } });
      const portal = await createPortalToken(tx, { workspaceId: actor.workspaceId, customerId: invoice.customerId, invoiceId: invoice.id, expiresAt });
      await logActivity(tx, actor, `Payment link requested for ${invoice.number} (${formatINR(balance.due)})`);
      return { kind: "reserved" as const, request, portalUrl: portal.url, customer: invoice.customer, number: invoice.number };
    });

    if (step.kind === "ready") return { url: step.url, portalUrl: step.portalUrl, demo: provider.name === "demo" };
    if (step.kind === "reconcile") { await reconcilePending(access.workspaceId, step.requestId, provider); continue; }
    if (step.kind === "cancel") { await cancelStaleRequests(access.workspaceId, [step.requestId], provider); continue; }

    let link: { id: string; url: string | null };
    try {
      link = await provider.createPaymentLink({ reference: step.request.reference, amount: step.request.amountPaise, description: `Invoice ${step.number}`, customerName: step.customer.name, customerPhone: step.customer.phone, callbackUrl: `${publicAppUrl()}/payment-complete`, expireBy: Math.floor(step.request.expiresAt!.getTime() / 1000) });
    } catch (error) {
      const definite = error instanceof ProviderRejectedError;
      await withSystemLock(access.workspaceId, (tx) => tx.paymentRequest.updateMany({ where: { id: step.request.id, status: "PENDING" }, data: { status: definite ? "FAILED" : "PENDING", lastError: error instanceof Error ? error.message.slice(0, 300) : "Provider error" } }));
      throw new UserError(definite ? "Razorpay refused to create the link. Check the customer's mobile number and try again." : "Could not confirm the link with Razorpay. Try again in a minute; no duplicate will be created.");
    }

    const activated = await withSystemLock(access.workspaceId, async (tx) => {
      const request = await tx.paymentRequest.findUniqueOrThrow({ where: { id: step.request.id } }); const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
      const due = (await balanceInTx(tx, invoiceId, invoice.totalPaise)).due;
      const stillValid = request.status === "PENDING" && invoice.status === "SENT" && due === request.amountPaise;
      await tx.paymentRequest.update({ where: { id: request.id }, data: { providerPaymentLinkId: link.id, url: link.url, status: stillValid ? "ACTIVE" : "CANCELLING" } });
      return stillValid;
    });
    if (!activated) { await cancelStaleRequests(access.workspaceId, [step.request.id], provider); continue; }
    return { url: link.url, portalUrl: step.portalUrl, demo: provider.name === "demo" };
  }
  throw new UserError("The payment link is still being updated. Try again in a minute.");
}

/** Razorpay webhook body, already signature-checked. Returns an HTTP status: non-2xx makes Razorpay retry. */
export async function applyWebhookEvent(provider: PaymentProvider, payload: unknown, findRequest: (linkId: string, reference: string | null) => Promise<{ id: string; workspaceId: string; status: string } | null>): Promise<{ status: number; body: Record<string, unknown> }> {
  const event = provider.parseWebhook(payload);
  if (event.kind === "ignored") return { status: 202, body: { received: true, ignored: true } };
  const request = await findRequest(event.linkId, event.reference);
  // Unknown link: possibly our activation has not committed yet. Ask Razorpay to retry rather than drop money.
  if (!request) return { status: 409, body: { error: "Unknown payment link; retry later." } };
  if (event.kind === "link_closed") {
    await withSystemLock(request.workspaceId, (tx) => tx.paymentRequest.updateMany({ where: { id: request.id, status: { in: ["ACTIVE", "CANCELLING", "PENDING"] } }, data: { status: event.status === "cancelled" ? "CANCELLED" : "EXPIRED" } }));
    return { status: 200, body: { received: true } };
  }
  const result = await withSystemLock(request.workspaceId, async (tx, actor) => {
    await tx.paymentRequest.updateMany({ where: { id: request.id, providerPaymentLinkId: null }, data: { providerPaymentLinkId: event.linkId } });
    const applied = await applyProviderPayment(tx, actor, request.id, event.payment);
    if (event.linkStatus === "paid") await tx.paymentRequest.updateMany({ where: { id: request.id, status: { in: ["PENDING", "ACTIVE", "CANCELLING"] } }, data: { status: "PAID" } });
    return applied;
  });
  if (result.staleRequestIds.length) await cancelStaleRequests(request.workspaceId, result.staleRequestIds, provider);
  return { status: 200, body: { received: true } };
}
