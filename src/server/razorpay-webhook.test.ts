import { describe, expect, it } from "vitest";
import { processRazorpayWebhook } from "./razorpay-webhook";
import type { PaymentProvider } from "./integrations/types";

const provider: PaymentProvider = {
  name: "razorpay",
  createPaymentLink: async () => ({ id: "plink_1", url: "https://example.test/pay" }),
  verifyWebhook: (_raw, signature) => signature === "valid",
  paymentLinkIdFromWebhook: () => "plink_1",
};

describe("Razorpay webhook", () => {
  it("verifies, scopes, and idempotently delegates a paid invoice", async () => {
    const paid: Array<[string, string]> = [];
    const db = { paymentRequest: { findFirst: async () => ({ workspaceId: "workspace-a", invoiceId: "invoice-a" }) } };
    const result = await processRazorpayWebhook('{"event":"payment_link.paid"}', "valid", { paymentProvider: provider, db: db as never, markInvoicePaid: async (workspaceId, invoiceId) => { paid.push([workspaceId, invoiceId]); } });
    expect(result).toEqual({ status: 200, body: { received: true } });
    expect(paid).toEqual([["workspace-a", "invoice-a"]]);
  });

  it("does not touch data for an invalid signature or unrelated event", async () => {
    const db = { paymentRequest: { findFirst: async () => { throw new Error("should not query"); } } };
    await expect(processRazorpayWebhook('{"event":"payment_link.paid"}', "no", { paymentProvider: provider, db: db as never })).resolves.toMatchObject({ status: 401 });
    await expect(processRazorpayWebhook('{"event":"payment.authorized"}', "valid", { paymentProvider: provider, db: db as never })).resolves.toMatchObject({ status: 202 });
  });
});
