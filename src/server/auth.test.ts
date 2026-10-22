import bcrypt from "bcrypt";
import { describe, expect, it } from "vitest";
import { ROLE_PERMISSIONS, can } from "./access";
import { authenticateUser, hashPassword, loginThrottle, passwordProblem, registerWorkspaceOwner } from "./auth";

describe("passwords", () => {
  it("uses bcrypt and only authenticates a matching email and password", async () => {
    const passwordHash = await hashPassword("correct horse battery staple");
    const db = { user: { findUnique: async ({ where }: { where: { email: string } }) => where.email === "owner@example.test" ? { id: "user-a", email: "owner@example.test", passwordHash } : null } };
    await expect(authenticateUser(db, " Owner@Example.Test ", "correct horse battery staple")).resolves.toEqual({ id: "user-a", email: "owner@example.test" });
    await expect(authenticateUser(db, "owner@example.test", "wrong password")).resolves.toBeNull();
    await expect(authenticateUser(db, "missing@example.test", "correct horse battery staple")).resolves.toBeNull();
    expect(passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it("still signs in accounts whose password predates the 72-byte limit", async () => {
    const legacy = "a".repeat(80);
    const db = { user: { findUnique: async () => ({ id: "user-a", email: "old@example.test", passwordHash: await bcrypt.hash(legacy, 4) }) } };
    await expect(authenticateUser(db, "old@example.test", legacy)).resolves.toMatchObject({ id: "user-a" });
  });

  it("refuses passwords bcrypt would silently truncate", async () => {
    expect(passwordProblem("a".repeat(72))).toBeNull();
    expect(passwordProblem("a".repeat(73))).toMatch(/72 bytes/);
    expect(passwordProblem("पासवर्ड".repeat(4))).toMatch(/72 bytes/);
    expect(passwordProblem("short")).toMatch(/12 characters/);
    await expect(hashPassword("a".repeat(73))).rejects.toThrow();
  });
});

describe("account registration", () => {
  it("creates a bcrypt-protected owner and membership atomically", async () => {
    const created: unknown[] = [];
    const db = {
      $transaction: async <T>(callback: (tx: never) => Promise<T>) => callback({
        user: { create: async ({ data }: { data: { email: string } }) => (created.push(data), { id: "user-a", email: data.email }) },
        workspace: { create: async ({ data }: { data: unknown }) => (created.push(data), { id: "workspace-a" }) },
        membership: { create: async ({ data }: { data: unknown }) => (created.push(data), { id: "membership-a" }) },
      } as never),
    };
    await expect(registerWorkspaceOwner(db, { email: "Owner@Example.Test", password: "correct horse battery staple", workspaceName: "Acme Repairs" })).resolves.toEqual({ userId: "user-a", workspaceId: "workspace-a", membershipId: "membership-a" });
    expect(created).toContainEqual({ userId: "user-a", workspaceId: "workspace-a", role: "OWNER" });
    expect(created[0]).toMatchObject({ email: "owner@example.test", passwordHash: expect.stringMatching(/^\$2[aby]\$/) });
  });
});

describe("roles", () => {
  it("gives technicians field work only and keeps settings and staff with the owner", () => {
    expect(can({ role: "MEMBER" }, "payments.cash")).toBe(true);
    expect(can({ role: "MEMBER" }, "invoices.write")).toBe(false);
    expect(can({ role: "ADMIN" }, "payments.request")).toBe(true);
    expect(can({ role: "ADMIN" }, "settings.write")).toBe(false);
    expect(can({ role: "ADMIN" }, "staff.manage")).toBe(false);
    for (const permission of ROLE_PERMISSIONS.ADMIN) expect(can({ role: "OWNER" }, permission)).toBe(true);
  });
});

describe("login throttle", () => {
  it("blocks an email after repeated failures and resets after the window", () => {
    const now = 1_000_000;
    for (let index = 0; index < 8; index += 1) loginThrottle.fail("x@example.test", now);
    expect(loginThrottle.blocked("x@example.test", now)).toBe(true);
    expect(loginThrottle.blocked("x@example.test", now + 16 * 60 * 1000)).toBe(false);
  });
});
