import { PrismaClient } from "@prisma/client";
import { createProviders, type Providers } from "./integrations/providers";
import { getPrisma } from "./prisma";

type DeliveryDatabase = Pick<PrismaClient, "invoice" | "deliveryLog">;

export async function sendInvoiceWhatsApp(input: { workspaceId: string; invoiceId: string; template?: { name: string; languageCode: string; components?: unknown[] }; text?: string }, dependencies: { db?: DeliveryDatabase; providers?: Providers } = {}) {
  const db = dependencies.db ?? getPrisma();
  const provider = (dependencies.providers ?? createProviders()).messaging;
  const invoice = await db.invoice.findFirst({ where: { id: input.invoiceId, workspaceId: input.workspaceId }, include: { customer: true } });
  if (!invoice) throw new Error("Invoice not found");
  const payload = input.template ? { type: "template", template: input.template } : { type: "text", body: input.text ?? `Your invoice ${invoice.number} is ready.` };
  try {
    const result = input.template ? await provider.sendTemplate({ to: invoice.customer.phone, template: input.template }) : await provider.sendText({ to: invoice.customer.phone, body: input.text ?? `Your invoice ${invoice.number} is ready.` });
    return await db.deliveryLog.create({ data: { workspaceId: input.workspaceId, customerId: invoice.customerId, invoiceId: invoice.id, channel: "WHATSAPP", provider: provider.name, recipient: invoice.customer.phone, template: input.template?.name, payloadJson: result.payload as never, status: "SENT", providerMessageId: result.providerMessageId, sentAt: new Date() } });
  } catch (error) {
    return await db.deliveryLog.create({ data: { workspaceId: input.workspaceId, customerId: invoice.customerId, invoiceId: invoice.id, channel: "WHATSAPP", provider: provider.name, recipient: invoice.customer.phone, template: input.template?.name, payloadJson: payload as never, status: "FAILED", error: error instanceof Error ? error.message : "Unknown delivery error" } });
  }
}
