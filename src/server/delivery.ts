import { createHmac, timingSafeEqual } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { formatPhone, whatsappRecipient } from "@/domain/phone";
import { formatINR } from "@/lib/format";
import type { Access } from "./access";
import { readEnvironment } from "./env";
import { UserError } from "./errors";
import type { MessagingProvider } from "./integrations/types";
import { createPortalToken } from "./portal";
import { getPrisma } from "./prisma";
import { invoiceBalance } from "./queries";
import { logActivity, withStaffLock, withSystemLock } from "./workspace-tx";

export type MessagePurpose = "invoice" | "reminder";
const REDACTED = "(private link)";

/**
 * Sends an approved WhatsApp template with a fresh private invoice link. The provider call happens outside the
 * workspace lock; the log never stores the link (it is a bearer token). A repeat within two minutes is refused.
 */
export async function sendInvoiceMessage(access: Access, invoiceId: string, purpose: MessagePurpose, messaging: MessagingProvider) {
  const env = readEnvironment();
  const prepared = await withStaffLock(access, "messages.send", async (tx, actor) => {
    const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, workspaceId: actor.workspaceId }, include: { customer: true, workspace: { select: { brandName: true } }, payments: { select: { amountPaise: true } }, creditNote: { select: { totalPaise: true } } } });
    if (!invoice) throw new UserError("Invoice not found.");
    if (invoice.status === "DRAFT" || invoice.status === "CREDITED") throw new UserError("Only issued invoices can be sent.");
    const due = invoiceBalance(invoice).due;
    if (purpose === "reminder" && due === 0) throw new UserError("Nothing is due on this invoice.");
    const recent = await tx.deliveryLog.findFirst({ where: { invoiceId, purpose, status: { not: "FAILED" }, createdAt: { gt: new Date(Date.now() - 2 * 60_000) } } });
    if (recent) throw new UserError("This message was sent a moment ago.");
    const portal = await createPortalToken(tx, { workspaceId: actor.workspaceId, customerId: invoice.customerId, invoiceId });
    await logActivity(tx, actor, `WhatsApp ${purpose} for ${invoice.number} to ${formatPhone(invoice.customer.phone)}`);
    return { invoice, due, url: portal.url, userId: actor.userId };
  });
  const { invoice } = prepared;
  const name = purpose === "invoice" ? env.WHATSAPP_TEMPLATE_INVOICE : env.WHATSAPP_TEMPLATE_REMINDER;
  const values = [invoice.customer.name, invoice.workspace.brandName, invoice.number ?? "", formatINR(purpose === "invoice" ? invoice.totalPaise : prepared.due), prepared.url];
  const template = { name, languageCode: env.WHATSAPP_TEMPLATE_LANGUAGE, components: [{ type: "body", parameters: values.map((text) => ({ type: "text", text })) }] };
  const logged = { type: "template", name, parameters: [...values.slice(0, 4), REDACTED] } as Prisma.InputJsonValue;
  const base = { workspaceId: access.workspaceId, customerId: invoice.customerId, invoiceId, channel: "WHATSAPP" as const, provider: messaging.name, recipient: invoice.customer.phone, template: name, purpose, payloadJson: logged };
  try {
    const result = await messaging.sendTemplate({ to: whatsappRecipient(invoice.customer.phone), template });
    await withSystemLock(access.workspaceId, (tx) => tx.deliveryLog.create({ data: { ...base, status: "SENT", providerMessageId: result.providerMessageId, sentAt: new Date() } }));
    return { status: "SENT" as const, demo: messaging.name === "demo" };
  } catch (error) {
    await withSystemLock(access.workspaceId, (tx) => tx.deliveryLog.create({ data: { ...base, status: "FAILED", error: error instanceof Error ? error.message.slice(0, 300) : "Unknown delivery error" } }));
    throw new UserError("WhatsApp did not accept the message. Check the number, or use Open in WhatsApp instead.");
  }
}

const statusRank = { SENT: 1, DELIVERED: 2, READ: 3, FAILED: 4 } as const;
const statusPayload = z.object({ entry: z.array(z.object({ changes: z.array(z.object({ value: z.object({ statuses: z.array(z.object({ id: z.string(), status: z.string(), errors: z.array(z.object({ title: z.string().optional(), message: z.string().optional() })).optional() })).optional() }) })) })) });

export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string) {
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", appSecret).update(rawBody).digest("hex"), "utf8");
  const received = Buffer.from(header.slice(7), "utf8");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/** Meta status callbacks: sent -> delivered -> read, or failed. Statuses only move forward. */
export async function applyWhatsAppStatuses(payload: unknown) {
  const parsed = statusPayload.safeParse(payload);
  if (!parsed.success) return 0;
  let updated = 0;
  for (const status of parsed.data.entry.flatMap((entry) => entry.changes.flatMap((change) => change.value.statuses ?? []))) {
    const next = ({ sent: "SENT", delivered: "DELIVERED", read: "READ", failed: "FAILED" } as const)[status.status as "sent"];
    if (!next) continue;
    const log = await getPrisma().deliveryLog.findUnique({ where: { providerMessageId: status.id } });
    if (!log || statusRank[next] <= statusRank[log.status]) continue;
    const error = status.errors?.map((item) => item.message ?? item.title).filter(Boolean).join("; ");
    await getPrisma().deliveryLog.update({ where: { id: log.id }, data: { status: next, ...(error ? { error: error.slice(0, 300) } : {}) } });
    updated += 1;
  }
  return updated;
}
