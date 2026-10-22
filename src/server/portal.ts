import { createHash, randomBytes } from "node:crypto";
import type { Access } from "./access";
import { publicAppUrl } from "./env";
import { UserError } from "./errors";
import { getPrisma } from "./prisma";
import { logActivity, withStaffLock, type Tx } from "./workspace-tx";

export const PORTAL_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
export const hashPortalToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const newPortalToken = () => randomBytes(32).toString("base64url");

/** Creates a customer link inside the caller's transaction. The raw token is returned once; only its hash is stored. */
export async function createPortalToken(tx: Tx, input: { workspaceId: string; customerId: string; invoiceId?: string; quoteId?: string; expiresAt?: Date }) {
  const token = newPortalToken();
  const expiresAt = input.expiresAt ?? new Date(Date.now() + PORTAL_LIFETIME_MS);
  const record = await tx.customerPortalToken.create({ data: { workspaceId: input.workspaceId, customerId: input.customerId, invoiceId: input.invoiceId, quoteId: input.quoteId, tokenHash: hashPortalToken(token), expiresAt } });
  return { id: record.id, url: `${publicAppUrl()}/p/${token}`, expiresAt };
}

/** A shareable link for a sent quote or an issued invoice. Drafts are never shown to customers. */
export function sharePortalLink(access: Access, target: { quoteId?: string; invoiceId?: string }) {
  return withStaffLock(access, "portal.share", async (tx, actor) => {
    if (target.quoteId) {
      const quote = await tx.quote.findFirst({ where: { id: target.quoteId, workspaceId: actor.workspaceId } });
      if (!quote) throw new UserError("Quote not found.");
      if (quote.status === "DRAFT") throw new UserError("Send the quote before sharing it.");
      await logActivity(tx, actor, `Customer link created for quote ${quote.number}`);
      return createPortalToken(tx, { workspaceId: actor.workspaceId, customerId: quote.customerId, quoteId: quote.id });
    }
    const invoice = await tx.invoice.findFirst({ where: { id: target.invoiceId, workspaceId: actor.workspaceId } });
    if (!invoice) throw new UserError("Invoice not found.");
    if (invoice.status === "DRAFT") throw new UserError("Issue the invoice before sharing it.");
    await logActivity(tx, actor, `Customer link created for invoice ${invoice.number}`);
    return createPortalToken(tx, { workspaceId: actor.workspaceId, customerId: invoice.customerId, invoiceId: invoice.id });
  });
}

export async function resolvePortalToken(token: string) {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null;
  const db = getPrisma();
  const portal = await db.customerPortalToken.findFirst({
    where: { tokenHash: hashPortalToken(token), revokedAt: null, expiresAt: { gt: new Date() } },
    include: { customer: { select: { name: true } }, invoice: true, quote: true, workspace: { select: { brandName: true, upiId: true } } },
  });
  if (!portal) return null;
  await db.customerPortalToken.update({ where: { id: portal.id }, data: { lastAccessedAt: new Date() } });
  return portal;
}
