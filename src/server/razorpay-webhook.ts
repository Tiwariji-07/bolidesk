import type { PrismaClient } from "@prisma/client";
import { createProviders } from "./integrations/providers";
import type { PaymentProvider } from "./integrations/types";
import { forWorkspace } from "./persistence";
import { getPrisma } from "./prisma";

type PaymentRequestLookup = Pick<PrismaClient, "paymentRequest">;
type WebhookDependencies = {
  paymentProvider?: PaymentProvider;
  db?: PaymentRequestLookup;
  markInvoicePaid?: (workspaceId: string, invoiceId: string) => Promise<unknown>;
};

export async function processRazorpayWebhook(rawBody: string, signature: string | null, dependencies: WebhookDependencies = {}) {
  const paymentProvider = dependencies.paymentProvider ?? createProviders().payments;
  if (paymentProvider.name !== "razorpay" || !paymentProvider.verifyWebhook(rawBody, signature)) return { status: 401, body: { error: "Invalid webhook signature." } };
  let payload: unknown;
  try { payload = JSON.parse(rawBody); } catch { return { status: 400, body: { error: "Invalid JSON payload." } }; }
  const event = typeof payload === "object" && payload !== null && "event" in payload ? (payload as { event?: unknown }).event : undefined;
  if (event !== "payment_link.paid") return { status: 202, body: { received: true, ignored: true } };
  const paymentLinkId = paymentProvider.paymentLinkIdFromWebhook(payload);
  if (!paymentLinkId) return { status: 400, body: { error: "Payment link id is missing." } };
  const db = dependencies.db ?? getPrisma();
  const request = await db.paymentRequest.findFirst({ where: { provider: "RAZORPAY", providerPaymentLinkId: paymentLinkId }, select: { workspaceId: true, invoiceId: true } });
  if (!request) return { status: 202, body: { received: true, ignored: true } };
  const markInvoicePaid = dependencies.markInvoicePaid ?? ((workspaceId: string, invoiceId: string) => forWorkspace(workspaceId).invoices.markPaid(invoiceId));
  await markInvoicePaid(request.workspaceId, request.invoiceId);
  return { status: 200, body: { received: true } };
}
