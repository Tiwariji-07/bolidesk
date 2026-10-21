import type { Access } from "./access";
import { issueInTx } from "./billing";
import { UserError } from "./errors";
import type { PaymentProvider } from "./integrations/types";
import { createPortalToken, PORTAL_LIFETIME_MS } from "./portal";
import { logActivity, withStaffLock, withSystemLock } from "./workspace-tx";
import { getPrisma } from "./prisma";

/** Marks an issued (or, for cash, a draft that is issued first) invoice fully paid. Replaced by the payments ledger. */
export function recordFullPayment(access: Access, invoiceId: string) {
  return withStaffLock(access, "payments.cash", async (tx, actor) => {
    let invoice = await tx.invoice.findFirst({ where: { id: invoiceId, workspaceId: actor.workspaceId } });
    if (!invoice) throw new UserError("Invoice not found.");
    if (invoice.status === "PAID") return invoice;
    if (invoice.status === "CREDITED") throw new UserError("This invoice was credited.");
    if (invoice.status === "DRAFT") invoice = await issueInTx(tx, actor, invoice);
    await tx.invoice.updateMany({ where: { id: invoice.id, status: "SENT" }, data: { status: "PAID", paidAt: new Date() } });
    await logActivity(tx, actor, `Payment recorded for ${invoice.number}`);
    return invoice;
  });
}

/** Interim: one request per invoice, created only for issued invoices. */
export async function createPaymentRequest(access: Access, invoiceId: string, provider: PaymentProvider) {
  const invoice = await getPrisma().invoice.findFirst({ where: { id: invoiceId, workspaceId: access.workspaceId }, include: { customer: true, paymentRequests: { orderBy: { createdAt: "desc" }, take: 1 } } });
  if (!invoice) throw new UserError("Invoice not found.");
  if (invoice.status !== "SENT") throw new UserError("Only issued, unpaid invoices can get a payment link.");
  if (invoice.paymentRequests[0]) return { url: invoice.paymentRequests[0].url };
  return withStaffLock(access, "payments.request", async (tx, actor) => {
    const portal = await createPortalToken(tx, { workspaceId: actor.workspaceId, customerId: invoice.customerId, invoiceId: invoice.id, expiresAt: new Date(Date.now() + PORTAL_LIFETIME_MS) });
    const link = await provider.createPaymentLink({ reference: `PR-${invoice.id}`, amount: invoice.totalPaise, description: `Invoice ${invoice.number}`, customerName: invoice.customer.name, customerPhone: invoice.customer.phone, callbackUrl: portal.url });
    await tx.paymentRequest.create({ data: { workspaceId: actor.workspaceId, invoiceId: invoice.id, reference: `PR-${invoice.id}`, amount: invoice.totalPaise, url: provider.name === "demo" ? portal.url : link.url, provider: provider.name === "razorpay" ? "RAZORPAY" : "DEMO", providerPaymentLinkId: link.id } });
    await logActivity(tx, actor, `Payment link created for ${invoice.number}`);
    return { url: provider.name === "demo" ? portal.url : link.url };
  });
}

export function markPaidFromWebhook(workspaceId: string, invoiceId: string) {
  return withSystemLock(workspaceId, async (tx, actor) => {
    const changed = await tx.invoice.updateMany({ where: { id: invoiceId, workspaceId, status: "SENT" }, data: { status: "PAID", paidAt: new Date() } });
    if (changed.count) await logActivity(tx, actor, "Razorpay payment received");
  });
}
