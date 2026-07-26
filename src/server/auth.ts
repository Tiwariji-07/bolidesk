import bcrypt from "bcrypt";
import { createHmac, timingSafeEqual } from "node:crypto";

export type SessionPayload = { userId: string; issuedAt: number; expiresAt: number };
export type MembershipRole = "OWNER" | "ADMIN" | "MEMBER";
type Membership = { userId: string; workspaceId: string; role: MembershipRole };

function encode(value: string) {
  return Buffer.from(value).toString("base64url");
}

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSessionToken(session: SessionPayload, secret: string) {
  const payload = encode(JSON.stringify(session));
  return `${payload}.${sign(payload, secret)}`;
}

export function readSessionToken(token: string | undefined, secret: string, now = Math.floor(Date.now() / 1000)): SessionPayload | null {
  if (!token) return null;
  const [payload, signature, ...rest] = token.split(".");
  if (!payload || !signature || rest.length) return null;
  const expected = sign(payload, secret);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionPayload;
    if (typeof parsed.userId !== "string" || !Number.isInteger(parsed.issuedAt) || !Number.isInteger(parsed.expiresAt) || parsed.expiresAt <= now) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

type AuthenticationDatabase = {
  user: { findUnique: (input: { where: { email: string } }) => Promise<{ id: string; email: string; passwordHash: string } | null> };
};

export async function authenticateUser(db: AuthenticationDatabase, email: string, password: string) {
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return null;
  return { id: user.id, email: user.email };
}

type RegistrationDatabase = {
  $transaction: <T>(callback: (tx: {
    user: { create: (input: { data: { email: string; passwordHash: string } }) => Promise<{ id: string; email: string }> };
    workspace: { create: (input: { data: { name: string; brandName: string } }) => Promise<{ id: string }> };
    membership: { create: (input: { data: { userId: string; workspaceId: string; role: "OWNER" } }) => Promise<unknown> };
  }) => Promise<T>) => Promise<T>;
};

export async function registerWorkspaceOwner(db: RegistrationDatabase, input: { email: string; password: string; workspaceName: string }) {
  const email = input.email.trim().toLowerCase();
  const workspaceName = input.workspaceName.trim();
  const passwordHash = await hashPassword(input.password);
  return db.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { email, passwordHash } });
    const workspace = await tx.workspace.create({ data: { name: workspaceName, brandName: workspaceName } });
    await tx.membership.create({ data: { userId: user.id, workspaceId: workspace.id, role: "OWNER" } });
    return { userId: user.id, workspaceId: workspace.id };
  });
}

/** Ignores untrusted client workspace input; the authenticated user's first membership is authoritative. */
export function resolveWorkspaceForUser(memberships: Membership[], userId: string, _untrustedWorkspaceId?: string) {
  const membership = memberships.find((item) => item.userId === userId);
  return membership ? { workspaceId: membership.workspaceId, role: membership.role } : null;
}
