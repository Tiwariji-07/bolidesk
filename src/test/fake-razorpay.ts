import { createHmac, randomBytes } from "node:crypto";
import { ProviderRejectedError, type PaymentLinkInput, type PaymentLinkState, type PaymentProvider, type PaymentWebhookEvent } from "@/server/integrations/types";

/** In-memory Razorpay with the same contract as the real adapter, plus knobs to simulate timeouts and payments. */
export class FakeRazorpay implements PaymentProvider {
  readonly name = "razorpay" as const;
  readonly links = new Map<string, PaymentLinkState & { expireBy: number }>();
  failNextCreate: "timeout-after-create" | "reject" | null = null;
  failCancels = false;

  async createPaymentLink(input: PaymentLinkInput) {
    if (this.failNextCreate === "reject") { this.failNextCreate = null; throw new ProviderRejectedError("rejected"); }
    if ([...this.links.values()].some((link) => link.reference === input.reference)) throw new ProviderRejectedError("reference already used");
    const id = `plink_${randomBytes(6).toString("hex")}`;
    this.links.set(id, { id, reference: input.reference, status: "created", amount: input.amount, url: `https://rzp.io/i/${id}`, payments: [], expireBy: input.expireBy });
    if (this.failNextCreate === "timeout-after-create") { this.failNextCreate = null; throw new Error("socket timeout"); }
    return { id, url: `https://rzp.io/i/${id}` };
  }
  /** Like Razorpay's list endpoint, the summary omits payments; callers must fetch the link itself. */
  async findPaymentLink(reference: string) { const link = [...this.links.values()].find((item) => item.reference === reference); return link ? { ...link, payments: [] } : null; }
  async fetchPaymentLink(id: string) { const link = this.links.get(id); if (!link) throw new Error("not found"); return link; }
  async cancelPaymentLink(id: string) { if (this.failCancels) throw new Error("Razorpay unavailable"); const link = this.links.get(id); if (link && link.status === "created") link.status = "cancelled"; }
  verifyWebhook(rawBody: string, signature: string | null) { return signature === sign(rawBody); }
  parseWebhook(payload: unknown): PaymentWebhookEvent { return payload as PaymentWebhookEvent; }

  /** Customer pays the link; returns the webhook event Razorpay would send. */
  pay(linkId: string, amount?: number): PaymentWebhookEvent {
    const link = this.links.get(linkId)!;
    const payment = { id: `pay_${randomBytes(6).toString("hex")}`, amount: amount ?? link.amount, currency: "INR", status: "captured" };
    link.payments.push(payment);
    link.status = link.payments.reduce((sum, item) => sum + item.amount, 0) >= link.amount ? "paid" : "partially_paid";
    return { kind: "payment", linkId, reference: link.reference, linkStatus: link.status, payment };
  }
}

export const sign = (body: string) => createHmac("sha256", "fake").update(body).digest("hex");
