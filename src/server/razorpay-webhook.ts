import { createProviders } from "./integrations/providers";
import type { PaymentProvider } from "./integrations/types";
import { applyWebhookEvent } from "./payments";
import { getPrisma } from "./prisma";

/** Verifies the HMAC over the exact raw body before parsing anything, then records the payment once. */
export async function processRazorpayWebhook(rawBody: string, signature: string | null, dependencies: { paymentProvider?: PaymentProvider } = {}) {
  const provider = dependencies.paymentProvider ?? createProviders().payments;
  if (provider.name !== "razorpay" || !provider.verifyWebhook(rawBody, signature)) return { status: 401, body: { error: "Invalid webhook signature." } };
  let payload: unknown;
  try { payload = JSON.parse(rawBody); } catch { return { status: 400, body: { error: "Invalid JSON payload." } }; }
  return applyWebhookEvent(provider, payload, (linkId, reference) => getPrisma().paymentRequest.findFirst({
    where: { provider: "RAZORPAY", OR: [{ providerPaymentLinkId: linkId }, ...(reference ? [{ reference }] : [])] },
    select: { id: true, workspaceId: true, status: true },
  }));
}
