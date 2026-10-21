import { describe, expect, it } from "vitest";
import { makeShop } from "@/test/fixtures";
import { AccessError } from "./access";
import { getPrisma } from "./prisma";
import { findSession, hashSessionToken, revokeMembershipSessions } from "./session";
import { acceptInvite, changeMemberRole, inviteMember, removeMember } from "./staff";
import { withStaffLock } from "./workspace-tx";

const tokenFrom = (url: string) => url.split("/invite/")[1];

describe("staff access (Postgres)", () => {
  it("lets only the owner invite, and an invite works exactly once", async () => {
    const shop = await makeShop();
    await expect(inviteMember(shop.office, { email: "x@example.test", role: "MEMBER" })).rejects.toBeInstanceOf(AccessError);
    const { url } = await inviteMember(shop.owner, { email: "New.Tech@Example.test", role: "MEMBER" });
    const results = await Promise.allSettled([
      acceptInvite({ token: tokenFrom(url), password: "a strong password 1" }),
      acceptInvite({ token: tokenFrom(url), password: "a strong password 1" }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const memberships = await getPrisma().membership.findMany({ where: { workspaceId: shop.workspace.id, user: { email: "new.tech@example.test" } } });
    expect(memberships).toMatchObject([{ role: "MEMBER" }]);
  });

  it("never resets an existing user's password through an invite", async () => {
    const shop = await makeShop();
    const other = await makeShop("Other");
    const { url } = await inviteMember(shop.owner, { email: other.office.email, role: "ADMIN" });
    await expect(acceptInvite({ token: tokenFrom(url), password: "attacker-chosen-password" })).rejects.toThrow(/password does not match/);
  });

  it("stops a removed member's in-flight and later writes", async () => {
    const shop = await makeShop();
    await removeMember(shop.owner, shop.technician.membershipId);
    await expect(withStaffLock(shop.technician, "jobs.write", async () => "wrote")).rejects.toMatchObject({ status: 401 });
  });

  it("signs a member out when their role changes, and refuses to touch the owner", async () => {
    const shop = await makeShop();
    await changeMemberRole(shop.owner, shop.office.membershipId, "MEMBER");
    await expect(withStaffLock(shop.office, "jobs.write", async () => "wrote")).rejects.toMatchObject({ status: 401 });
    await expect(removeMember(shop.owner, shop.owner.membershipId)).rejects.toThrow(/owner cannot be removed/);
  });

  it("re-checks the role inside the lock", async () => {
    const shop = await makeShop();
    await expect(withStaffLock(shop.technician, "settings.write", async () => "wrote")).rejects.toMatchObject({ status: 403 });
    await expect(withStaffLock(shop.owner, "settings.write", async () => "wrote")).resolves.toBe("wrote");
  });

  it("resolves only live sessions", async () => {
    const shop = await makeShop();
    const db = getPrisma();
    await db.session.create({ data: { tokenHash: hashSessionToken("live-token"), membershipId: shop.office.membershipId, expiresAt: new Date(Date.now() + 60_000) } });
    expect(await findSession("live-token")).toMatchObject({ role: "ADMIN", workspaceId: shop.workspace.id });
    await revokeMembershipSessions(db, shop.office.membershipId);
    expect(await findSession("live-token")).toBeNull();
    expect(await findSession("never-issued")).toBeNull();
  });
});
