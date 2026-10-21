import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { OpenAiStructuredJobParser } from "./openai";
import { readEnvironment } from "../env";
import { createProviders } from "./providers";
import { RazorpayProvider, verifyRazorpaySignature } from "./razorpay";
import { ProviderRejectedError } from "./types";
import { WhatsAppCloudProvider } from "./whatsapp";

describe("credential-ready providers", () => {
  it("uses local-safe providers without credentials", () => {
    const providers = createProviders({ env: readEnvironment({ DEMO_MODE: "true" }) });
    expect([providers.jobParser.name, providers.messaging.name, providers.payments.name]).toEqual(["local-demo", "demo", "demo"]);
  });

  it("refuses to fall back to demo adapters in live mode", () => {
    expect(() => createProviders({ env: readEnvironment({ DEMO_MODE: "false", OPENAI_API_KEY: "key" }) })).toThrow("WHATSAPP_ACCESS_TOKEN is required");
  });

  it("parses OpenAI output into exact paise and keeps an unstated GST rate empty", async () => {
    const calls: RequestInit[] = [];
    const parser = new OpenAiStructuredJobParser("test-key", "test-model", async (_url, init) => {
      calls.push(init!);
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ customerName: "Ravi", dueDate: "2026-02-31", paymentTerms: null, lines: [{ description: "AC service", quantity: 2, unitPriceRupees: "650.50", taxRate: 18 }, { description: "Visit", quantity: 1, unitPriceRupees: "300", taxRate: null }, { description: "Junk", quantity: 1, unitPriceRupees: "abc", taxRate: 18 }] }) } }] }), { status: 200 });
    });
    const parsed = await parser.parse("Ravi, 2 AC service at 650.50, GST 18%, visit 300");
    expect(parsed.lines).toEqual([{ description: "AC service", quantity: 2, unitPrice: 65050, taxRate: 18 }, { description: "Visit", quantity: 1, unitPrice: 30000, taxRate: null }]);
    expect(parsed.dueDate).toBeUndefined();
    expect(calls[0].headers).toMatchObject({ Authorization: "Bearer test-key" });
  });

  it("sends WhatsApp templates through an injected fetcher", async () => {
    let request = "";
    const provider = new WhatsAppCloudProvider("token", "phone-id", "v22.0", async (_url, init) => {
      request = String(init?.body);
      return new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }));
    });
    await expect(provider.sendTemplate({ to: "919999999999", template: { name: "invoice_ready", languageCode: "en" } })).resolves.toMatchObject({ providerMessageId: "wamid.1" });
    expect(request).toContain('"type":"template"');
  });

  it("creates Razorpay links in paise with an expiry, and tells rejections from timeouts", async () => {
    let sent: Record<string, unknown> = {};
    const paying = new RazorpayProvider("key", "secret", "webhook-secret", async (_url, init) => { sent = JSON.parse(String(init?.body)); return new Response(JSON.stringify({ id: "plink_1", status: "created", amount: 25050, short_url: "https://rzp.io/i/1" })); });
    const input = { reference: "PR1", amount: 25050, description: "Invoice", customerName: "Ravi", customerPhone: "+91 99999 99999", callbackUrl: "https://app.example/payment-complete", expireBy: 1_900_000_000 };
    await expect(paying.createPaymentLink(input)).resolves.toEqual({ id: "plink_1", url: "https://rzp.io/i/1" });
    expect(sent).toMatchObject({ amount: 25050, expire_by: 1_900_000_000, reference_id: "PR1", currency: "INR" });
    const rejecting = new RazorpayProvider("key", "secret", "webhook-secret", async () => new Response("{}", { status: 400 }));
    await expect(rejecting.createPaymentLink(input)).rejects.toBeInstanceOf(ProviderRejectedError);
    const failing = new RazorpayProvider("key", "secret", "webhook-secret", async () => new Response("{}", { status: 503 }));
    await expect(failing.createPaymentLink(input)).rejects.not.toBeInstanceOf(ProviderRejectedError);
  });

  it("verifies webhook signatures over the raw body and reads payment events", () => {
    const raw = '{"event":"payment_link.paid"}';
    const signature = createHmac("sha256", "webhook-secret").update(raw).digest("hex");
    expect(verifyRazorpaySignature(raw, signature, "webhook-secret")).toBe(true);
    expect(verifyRazorpaySignature(raw, signature, "wrong-secret")).toBe(false);
    expect(verifyRazorpaySignature(raw, null, "webhook-secret")).toBe(false);
    const provider = new RazorpayProvider("key", "secret", "webhook-secret");
    expect(provider.parseWebhook({ event: "payment_link.paid", payload: { payment_link: { entity: { id: "plink_1", reference_id: "PR1", status: "paid" } }, payment: { entity: { id: "pay_1", amount: 25050, currency: "INR", status: "captured" } } } }))
      .toEqual({ kind: "payment", linkId: "plink_1", reference: "PR1", linkStatus: "paid", payment: { id: "pay_1", amount: 25050, currency: "INR", status: "captured" } });
    expect(provider.parseWebhook({ event: "payment.authorized", payload: {} })).toEqual({ kind: "ignored" });
  });
});
