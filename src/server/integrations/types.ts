import type { ParsedJobNote } from "../../domain/job-note";

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export interface JobParserProvider {
  readonly name: string;
  parse(note: string): Promise<ParsedJobNote>;
}

export type WhatsAppTemplate = { name: string; languageCode: string; components?: unknown[] };
export type DeliveryResult = { providerMessageId?: string; payload: unknown };

export interface MessagingProvider {
  readonly name: string;
  sendText(input: { to: string; body: string }): Promise<DeliveryResult>;
  sendTemplate(input: { to: string; template: WhatsAppTemplate }): Promise<DeliveryResult>;
}

export type PaymentLinkInput = { reference: string; amount: number; description: string; customerName: string; customerPhone: string; callbackUrl: string };
export type PaymentLinkResult = { id: string; url: string };

export interface PaymentProvider {
  readonly name: "demo" | "razorpay";
  createPaymentLink(input: PaymentLinkInput): Promise<PaymentLinkResult>;
  verifyWebhook(rawBody: string, signature: string | null): boolean;
  paymentLinkIdFromWebhook(payload: unknown): string | null;
}
