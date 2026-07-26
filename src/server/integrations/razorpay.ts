import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Fetcher, PaymentLinkInput, PaymentLinkResult, PaymentProvider } from "./types";

const webhookSchema = z.object({ payload: z.object({ payment_link: z.object({ entity: z.object({ id: z.string() }) }).optional(), payment: z.object({ entity: z.object({ payment_link_id: z.string().optional() }) }).optional() }).optional() });

export function verifyRazorpaySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const received = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return received.length === expectedBuffer.length && timingSafeEqual(received, expectedBuffer);
}

export class RazorpayProvider implements PaymentProvider {
  readonly name = "razorpay" as const;
  constructor(private readonly keyId: string, private readonly keySecret: string, private readonly webhookSecret: string, private readonly fetcher: Fetcher = fetch) {}

  async createPaymentLink(input: PaymentLinkInput): Promise<PaymentLinkResult> {
    const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64");
    const response = await this.fetcher("https://api.razorpay.com/v1/payment_links", { method: "POST", headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" }, body: JSON.stringify({ amount: input.amount * 100, currency: "INR", reference_id: input.reference, description: input.description, customer: { name: input.customerName, contact: input.customerPhone.replace(/\D/g, "") }, callback_url: input.callbackUrl, callback_method: "get", notify: { sms: false, email: false }, reminder_enable: true }) });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`Razorpay payment link failed (${response.status}).`);
    const data = z.object({ id: z.string(), short_url: z.string().url() }).parse(body);
    return { id: data.id, url: data.short_url };
  }

  verifyWebhook(rawBody: string, signature: string | null): boolean { return verifyRazorpaySignature(rawBody, signature, this.webhookSecret); }
  paymentLinkIdFromWebhook(payload: unknown): string | null {
    const parsed = webhookSchema.safeParse(payload);
    return parsed.success ? parsed.data.payload?.payment_link?.entity.id ?? parsed.data.payload?.payment?.entity.payment_link_id ?? null : null;
  }
}
