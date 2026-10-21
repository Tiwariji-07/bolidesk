import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ProviderRejectedError, type Fetcher, type PaymentLinkInput, type PaymentLinkResult, type PaymentLinkState, type PaymentProvider, type PaymentWebhookEvent } from "./types";

const TIMEOUT_MS = 15_000;
const link = z.object({ id: z.string(), reference_id: z.string().nullish(), status: z.string(), amount: z.number().int(), short_url: z.string().url().nullish(), payments: z.array(z.object({ payment_id: z.string(), amount: z.number().int(), status: z.string(), created_at: z.number().int().optional() })).nullish() });
const payment = z.object({ id: z.string(), amount: z.number().int(), currency: z.string(), status: z.string(), created_at: z.number().int().optional() });
const webhook = z.object({
  event: z.string(),
  payload: z.object({
    payment_link: z.object({ entity: z.object({ id: z.string(), reference_id: z.string().nullish(), status: z.string() }) }).optional(),
    payment: z.object({ entity: payment }).optional(),
  }),
});

export function verifyRazorpaySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"), "utf8");
  const received = Buffer.from(signature, "utf8");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function toState(data: z.infer<typeof link>): PaymentLinkState {
  return { id: data.id, reference: data.reference_id ?? null, status: data.status, amount: data.amount, url: data.short_url ?? null, payments: (data.payments ?? []).map((item) => ({ id: item.payment_id, amount: item.amount, currency: "INR", status: item.status, createdAt: item.created_at })) };
}

export class RazorpayProvider implements PaymentProvider {
  readonly name = "razorpay" as const;
  constructor(private readonly keyId: string, private readonly keySecret: string, private readonly webhookSecret: string, private readonly fetcher: Fetcher = fetch) {}

  private async call(path: string, init: RequestInit = {}) {
    const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64");
    const response = await this.fetcher(`https://api.razorpay.com/v1${path}`, { ...init, headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const body: unknown = await response.json().catch(() => null);
    return { response, body };
  }

  async createPaymentLink(input: PaymentLinkInput): Promise<PaymentLinkResult> {
    const { response, body } = await this.call("/payment_links", { method: "POST", body: JSON.stringify({ amount: input.amount, currency: "INR", accept_partial: false, reference_id: input.reference, description: input.description.slice(0, 2048), expire_by: input.expireBy, customer: { name: input.customerName, contact: input.customerPhone.replace(/\D/g, "") }, callback_url: input.callbackUrl, callback_method: "get", notify: { sms: false, email: false }, reminder_enable: false }) });
    // 4xx is a definite rejection (no link exists). 5xx or a timeout leaves the outcome unknown; the caller reconciles by reference.
    if (response.status >= 400 && response.status < 500) throw new ProviderRejectedError(`Razorpay rejected the payment link (${response.status}).`);
    if (!response.ok) throw new Error(`Razorpay payment link failed (${response.status}).`);
    const data = link.parse(body);
    return { id: data.id, url: data.short_url ?? null };
  }

  async findPaymentLink(reference: string) {
    const { response, body } = await this.call(`/payment_links?reference_id=${encodeURIComponent(reference)}`);
    if (!response.ok) throw new Error(`Razorpay lookup failed (${response.status}).`);
    const items = z.object({ payment_links: z.array(link) }).parse(body).payment_links;
    return items[0] ? toState(items[0]) : null;
  }

  async fetchPaymentLink(id: string) {
    const { response, body } = await this.call(`/payment_links/${encodeURIComponent(id)}`);
    if (!response.ok) throw new Error(`Razorpay lookup failed (${response.status}).`);
    return toState(link.parse(body));
  }

  async cancelPaymentLink(id: string) {
    const { response } = await this.call(`/payment_links/${encodeURIComponent(id)}/cancel`, { method: "POST" });
    // Already paid/cancelled/expired links answer 400; the caller re-fetches the real state either way.
    if (!response.ok && response.status !== 400) throw new Error(`Razorpay cancel failed (${response.status}).`);
  }

  verifyWebhook(rawBody: string, signature: string | null): boolean {
    return verifyRazorpaySignature(rawBody, signature, this.webhookSecret);
  }

  parseWebhook(payload: unknown): PaymentWebhookEvent {
    const parsed = webhook.safeParse(payload);
    if (!parsed.success || !parsed.data.payload.payment_link) return { kind: "ignored" };
    const entity = parsed.data.payload.payment_link.entity;
    if ((parsed.data.event === "payment_link.paid" || parsed.data.event === "payment_link.partially_paid") && parsed.data.payload.payment) {
      const { created_at: createdAt, ...rest } = parsed.data.payload.payment.entity;
      return { kind: "payment", linkId: entity.id, reference: entity.reference_id ?? null, linkStatus: entity.status, payment: { ...rest, createdAt } };
    }
    if (parsed.data.event === "payment_link.cancelled" || parsed.data.event === "payment_link.expired") return { kind: "link_closed", linkId: entity.id, reference: entity.reference_id ?? null, status: parsed.data.event === "payment_link.cancelled" ? "cancelled" : "expired" };
    return { kind: "ignored" };
  }
}
