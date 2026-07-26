import { localJobNoteParser } from "../../domain/job-note";
import { readEnvironment, type AppEnvironment } from "../env";
import { OpenAiStructuredJobParser } from "./openai";
import { RazorpayProvider } from "./razorpay";
import type { DeliveryResult, Fetcher, JobParserProvider, MessagingProvider, PaymentLinkInput, PaymentLinkResult, PaymentProvider } from "./types";
import { WhatsAppCloudProvider } from "./whatsapp";

class DemoJobParser implements JobParserProvider {
  readonly name = "local-demo";
  async parse(note: string) { return localJobNoteParser.parse(note); }
}

class DemoMessagingProvider implements MessagingProvider {
  readonly name = "demo";
  async sendText(input: { to: string; body: string }): Promise<DeliveryResult> { return { providerMessageId: `demo-${Date.now()}`, payload: { type: "text", ...input } }; }
  async sendTemplate(input: { to: string; template: { name: string; languageCode: string; components?: unknown[] } }): Promise<DeliveryResult> { return { providerMessageId: `demo-${Date.now()}`, payload: { type: "template", ...input } }; }
}

class DemoPaymentProvider implements PaymentProvider {
  readonly name = "demo" as const;
  async createPaymentLink(input: PaymentLinkInput): Promise<PaymentLinkResult> { return { id: `demo-${input.reference}`, url: input.callbackUrl }; }
  verifyWebhook(): boolean { return false; }
  paymentLinkIdFromWebhook(): string | null { return null; }
}

export type Providers = { jobParser: JobParserProvider; messaging: MessagingProvider; payments: PaymentProvider };

/** Chooses live adapters only when every required credential is intentionally present. */
export function createProviders(options: { env?: AppEnvironment; fetcher?: Fetcher } = {}): Providers {
  const env = options.env ?? readEnvironment();
  const fetcher = options.fetcher ?? fetch;
  const demo = { jobParser: new DemoJobParser(), messaging: new DemoMessagingProvider(), payments: new DemoPaymentProvider() };
  if (env.DEMO_MODE) return demo;
  return {
    jobParser: env.AI_PROVIDER === "openai" && env.OPENAI_API_KEY ? new OpenAiStructuredJobParser(env.OPENAI_API_KEY, env.OPENAI_MODEL, fetcher) : demo.jobParser,
    messaging: env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID ? new WhatsAppCloudProvider(env.WHATSAPP_ACCESS_TOKEN, env.WHATSAPP_PHONE_NUMBER_ID, env.WHATSAPP_API_VERSION, fetcher) : demo.messaging,
    payments: env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET && env.RAZORPAY_WEBHOOK_SECRET ? new RazorpayProvider(env.RAZORPAY_KEY_ID, env.RAZORPAY_KEY_SECRET, env.RAZORPAY_WEBHOOK_SECRET, fetcher) : demo.payments,
  };
}
