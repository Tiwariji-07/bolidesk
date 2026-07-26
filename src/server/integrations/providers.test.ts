import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { OpenAiStructuredJobParser } from "./openai";
import { createProviders } from "./providers";
import { RazorpayProvider, verifyRazorpaySignature } from "./razorpay";
import { WhatsAppCloudProvider } from "./whatsapp";

describe("credential-ready providers", () => {
  it("uses local-safe providers without credentials", () => {
    const providers = createProviders({ env: { DEMO_MODE: true, OPENAI_MODEL: "gpt-4.1-mini", WHATSAPP_API_VERSION: "v22.0" } });
    expect([providers.jobParser.name, providers.messaging.name, providers.payments.name]).toEqual(["local-demo", "demo", "demo"]);
  });

  it("parses OpenAI structured output through an injected fetcher", async () => {
    const calls: RequestInit[] = [];
    const parser = new OpenAiStructuredJobParser("test-key", "test-model", async (_url, init) => {
      calls.push(init!);
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ paymentTerms: "Due on receipt", lines: [{ description: "AC service", quantity: 1, unitPrice: 650, taxRate: 18 }] }) } }] }), { status: 200 });
    });
    await expect(parser.parse("Ravi, AC service at 650")).resolves.toMatchObject({ lines: [{ unitPrice: 650 }] });
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

  it("creates Razorpay payment links and validates signatures without a network", async () => {
    const provider = new RazorpayProvider("key", "secret", "webhook-secret", async () => new Response(JSON.stringify({ id: "plink_1", short_url: "https://rzp.io/i/1" })));
    await expect(provider.createPaymentLink({ reference: "PR-1", amount: 250, description: "Invoice", customerName: "Ravi", customerPhone: "+91 99999 99999", callbackUrl: "https://app.example/p/token" })).resolves.toEqual({ id: "plink_1", url: "https://rzp.io/i/1" });
    const raw = '{"event":"payment_link.paid"}';
    const signature = createHmac("sha256", "webhook-secret").update(raw).digest("hex");
    expect(verifyRazorpaySignature(raw, signature, "webhook-secret")).toBe(true);
    expect(verifyRazorpaySignature(raw, signature, "wrong-secret")).toBe(false);
  });
});
