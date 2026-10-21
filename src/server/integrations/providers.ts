import { randomUUID } from "node:crypto";
import { localJobNoteParser } from "../../domain/job-note";
import { readEnvironment, type AppEnvironment } from "../env";
import { OpenAiStructuredJobParser } from "./openai";
import { RazorpayProvider } from "./razorpay";
import type { DeliveryResult, Fetcher, JobParserProvider, MessagingProvider, PaymentLinkInput, PaymentLinkResult, PaymentLinkState, PaymentProvider, PaymentWebhookEvent } from "./types";
import { WhatsAppCloudProvider } from "./whatsapp";

class DemoJobParser implements JobParserProvider {
  readonly name = "local-demo";
  async parse(note: string) { return localJobNoteParser.parse(note); }
}

class DemoMessagingProvider implements MessagingProvider {
  readonly name = "demo";
  async sendTemplate(input: { to: string; template: { name: string; languageCode: string; components?: unknown[] } }): Promise<DeliveryResult> { return { providerMessageId: `demo-${randomUUID()}`, payload: { type: "template", ...input } }; }
}

/** Demo links have no payable URL; nothing is collected and no status ever changes from them. */
class DemoPaymentProvider implements PaymentProvider {
  readonly name = "demo" as const;
  async createPaymentLink(input: PaymentLinkInput): Promise<PaymentLinkResult> { return { id: `demo_${input.reference}`, url: null }; }
  async findPaymentLink(): Promise<PaymentLinkState | null> { return null; }
  async fetchPaymentLink(id: string): Promise<PaymentLinkState> { return { id, reference: null, status: "created", amount: 0, url: null, payments: [] }; }
  async cancelPaymentLink() {}
  verifyWebhook(): boolean { return false; }
  parseWebhook(): PaymentWebhookEvent { return { kind: "ignored" }; }
}

export type Providers = { jobParser: JobParserProvider; messaging: MessagingProvider; payments: PaymentProvider };

function required(value: string | undefined, variable: string) {
  if (!value) throw new Error(`${variable} is required when DEMO_MODE=false.`);
  return value;
}

/** Demo adapters in demo mode; otherwise live adapters, and a missing credential is an error, never a silent demo fallback. */
export function createProviders(options: { env?: AppEnvironment; fetcher?: Fetcher } = {}): Providers {
  const env = options.env ?? readEnvironment();
  const fetcher = options.fetcher ?? fetch;
  if (env.DEMO_MODE) return { jobParser: new DemoJobParser(), messaging: new DemoMessagingProvider(), payments: new DemoPaymentProvider() };
  return {
    jobParser: new OpenAiStructuredJobParser(required(env.OPENAI_API_KEY, "OPENAI_API_KEY"), env.OPENAI_MODEL, fetcher),
    messaging: new WhatsAppCloudProvider(required(env.WHATSAPP_ACCESS_TOKEN, "WHATSAPP_ACCESS_TOKEN"), required(env.WHATSAPP_PHONE_NUMBER_ID, "WHATSAPP_PHONE_NUMBER_ID"), env.WHATSAPP_API_VERSION, fetcher),
    payments: new RazorpayProvider(required(env.RAZORPAY_KEY_ID, "RAZORPAY_KEY_ID"), required(env.RAZORPAY_KEY_SECRET, "RAZORPAY_KEY_SECRET"), required(env.RAZORPAY_WEBHOOK_SECRET, "RAZORPAY_WEBHOOK_SECRET"), fetcher),
  };
}
