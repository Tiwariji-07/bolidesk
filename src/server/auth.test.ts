import { describe, expect, it } from "vitest";
import { authenticateUser, createSessionToken, hashPassword, readSessionToken, registerWorkspaceOwner, resolveWorkspaceForUser } from "./auth";

describe("session tokens", () => {
  const secret = "test-session-secret-with-at-least-thirty-two-characters";

  it("round-trips a signed user session", () => {
    const token = createSessionToken({ userId: "user-a", issuedAt: 1_700_000_000, expiresAt: 1_700_086_400 }, secret);

    expect(readSessionToken(token, secret, 1_700_000_001)).toEqual({ userId: "user-a", issuedAt: 1_700_000_000, expiresAt: 1_700_086_400 });
  });

  it("rejects a tampered or expired session", () => {
    const token = createSessionToken({ userId: "user-a", issuedAt: 100, expiresAt: 200 }, secret);

    expect(readSessionToken(`${token}x`, secret, 150)).toBeNull();
    expect(readSessionToken(token, secret, 200)).toBeNull();
  });
});


describe("password authentication", () => {
  it("uses a bcrypt hash and only authenticates a matching email and password", async () => {
    const passwordHash = await hashPassword("correct horse battery staple");
    const db = {
      user: {
        findUnique: async ({ where }: { where: { email: string } }) => where.email === "owner@example.test"
          ? { id: "user-a", email: "owner@example.test", passwordHash }
          : null,
      },
    };

    await expect(authenticateUser(db, "owner@example.test", "correct horse battery staple")).resolves.toEqual({ id: "user-a", email: "owner@example.test" });
    await expect(authenticateUser(db, "owner@example.test", "wrong password")).resolves.toBeNull();
    await expect(authenticateUser(db, "missing@example.test", "correct horse battery staple")).resolves.toBeNull();
    expect(passwordHash).toMatch(/^\$2[aby]\$/);
  });
});


describe("account registration", () => {
  it("creates a bcrypt-protected owner and membership atomically", async () => {
    const created: unknown[] = [];
    const db = {
      $transaction: async <T>(callback: (tx: { user: { create: (input: { data: { email: string; passwordHash: string } }) => Promise<{ id: string; email: string }> }; workspace: { create: (input: { data: { name: string; brandName: string } }) => Promise<{ id: string }> }; membership: { create: (input: { data: { userId: string; workspaceId: string; role: "OWNER" } }) => Promise<unknown> } }) => Promise<T>) => callback({
        user: { create: async ({ data }) => (created.push(data), { id: "user-a", email: data.email }) },
        workspace: { create: async ({ data }) => (created.push(data), { id: "workspace-a" }) },
        membership: { create: async ({ data }) => (created.push(data), data) },
      }),
    };

    await expect(registerWorkspaceOwner(db, { email: "Owner@Example.Test", password: "correct horse battery staple", workspaceName: "Acme Repairs" })).resolves.toEqual({ userId: "user-a", workspaceId: "workspace-a" });
    expect(created).toContainEqual({ userId: "user-a", workspaceId: "workspace-a", role: "OWNER" });
    expect(created[0]).toMatchObject({ email: "owner@example.test", passwordHash: expect.stringMatching(/^\$2[aby]\$/) });
  });
});

describe("tenant resolution", () => {
  it("derives the selected workspace only from an active membership", () => {
    const memberships = [
      { userId: "user-a", workspaceId: "workspace-a", role: "OWNER" as const },
      { userId: "user-b", workspaceId: "workspace-b", role: "MEMBER" as const },
    ];

    expect(resolveWorkspaceForUser(memberships, "user-a")).toEqual({ workspaceId: "workspace-a", role: "OWNER" });
    expect(resolveWorkspaceForUser(memberships, "user-a", "workspace-b")).toEqual({ workspaceId: "workspace-a", role: "OWNER" });
  });

  it("does not resolve a workspace for a user without a membership", () => {
    expect(resolveWorkspaceForUser([], "user-a")).toBeNull();
  });
});
