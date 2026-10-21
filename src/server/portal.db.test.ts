import { describe, expect, it } from "vitest";
import { makeShop } from "@/test/fixtures";
import { createCustomer } from "./customers";
import { createPortalToken, resolvePortalToken } from "./portal";
import { getPrisma } from "./prisma";
import { withSystemLock } from "./workspace-tx";

const tokenOf = (url: string) => url.split("/p/")[1];

describe("customer links (Postgres)", () => {
  it("opens only with a live, unrevoked token, and stores only its hash", async () => {
    const shop = await makeShop();
    const customer = await createCustomer(shop.office, { name: "Ravi", phone: "98765 43210" });
    const make = (expiresAt?: Date) => withSystemLock(shop.workspace.id, (tx) => createPortalToken(tx, { workspaceId: shop.workspace.id, customerId: customer.id, expiresAt }));
    const live = await make();
    expect(await resolvePortalToken(tokenOf(live.url))).toMatchObject({ customerId: customer.id });
    expect(await getPrisma().customerPortalToken.count({ where: { tokenHash: tokenOf(live.url) } })).toBe(0);

    const expired = await make(new Date(Date.now() - 1000));
    expect(await resolvePortalToken(tokenOf(expired.url))).toBeNull();

    const revoked = await make();
    await getPrisma().customerPortalToken.update({ where: { id: revoked.id }, data: { revokedAt: new Date() } });
    expect(await resolvePortalToken(tokenOf(revoked.url))).toBeNull();

    expect(await resolvePortalToken("not-a-real-token-but-long-enough-to-look-like-one-xx")).toBeNull();
    expect(await resolvePortalToken("../../etc/passwd")).toBeNull();
  });
});
