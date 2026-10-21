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
  sendTemplate(input: { to: string; template: WhatsAppTemplate }): Promise<DeliveryResult>;
}

/** Amounts are integer paise, as Razorpay expects. expireBy is epoch seconds. */
export type PaymentLinkInput = { reference: string; amount: number; description: string; customerName: string; customerPhone: string; callbackUrl: string; expireBy: number };
export type PaymentLinkResult = { id: string; url: string | null };
/** createdAt: epoch seconds at the provider, when known. */
export type ProviderPayment = { id: string; amount: number; currency: string; status: string; createdAt?: number };
export type PaymentLinkState = { id: string; reference: string | null; status: "created" | "partially_paid" | "paid" | "cancelled" | "expired" | string; amount: number; url: string | null; payments: ProviderPayment[] };
export type PaymentWebhookEvent =
  | { kind: "payment"; linkId: string; reference: string | null; linkStatus: string; payment: ProviderPayment }
  | { kind: "link_closed"; linkId: string; reference: string | null; status: "cancelled" | "expired" }
  | { kind: "ignored" };

/** A definite "no link was created" answer, as opposed to a timeout where the outcome is unknown. */
export class ProviderRejectedError extends Error {}

export interface PaymentProvider {
  readonly name: "demo" | "razorpay";
  createPaymentLink(input: PaymentLinkInput): Promise<PaymentLinkResult>;
  /** Looks up a link by our reference, to recover from an uncertain create. */
  findPaymentLink(reference: string): Promise<PaymentLinkState | null>;
  fetchPaymentLink(id: string): Promise<PaymentLinkState>;
  cancelPaymentLink(id: string): Promise<void>;
  verifyWebhook(rawBody: string, signature: string | null): boolean;
  parseWebhook(payload: unknown): PaymentWebhookEvent;
}
