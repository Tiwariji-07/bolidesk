import { createHash, randomBytes } from "node:crypto";
import { getPrisma } from "./prisma";

export const hashPortalToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const newPortalToken = () => randomBytes(32).toString("base64url");

export async function resolvePortalToken(token: string) {
  const tokenHash = hashPortalToken(token);
  const portal = await getPrisma().customerPortalToken.findFirst({
    where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
    include: { customer: true, invoice: true, quote: true },
  });
  if (!portal) return null;
  await getPrisma().customerPortalToken.update({ where: { id: portal.id }, data: { lastAccessedAt: new Date() } });
  return portal;
}
