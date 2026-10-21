import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { Prisma, PrismaClient } from "@prisma/client";
import { getPrisma } from "./prisma";

export const SESSION_COOKIE_NAME = "bolidesk_session";
const SESSION_LIFETIME_SECONDS = 7 * 24 * 60 * 60;
const TOUCH_AFTER_MS = 15 * 60 * 1000;

type Db = PrismaClient | Prisma.TransactionClient;

export const hashSessionToken = (token: string) => createHash("sha256").update(token).digest("hex");

const cookieOptions = () => ({ httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" });

export type ActiveSession = { sessionId: string; membershipId: string; userId: string; workspaceId: string; role: "OWNER" | "ADMIN" | "MEMBER"; workspaceName: string; email: string; name: string | null };

/** Resolves a raw token to a live session; revoked, expired or orphaned sessions resolve to null. */
export async function findSession(token: string | undefined, db: Db = getPrisma(), now = new Date()): Promise<ActiveSession | null> {
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    select: { id: true, expiresAt: true, revokedAt: true, lastSeenAt: true, membership: { select: { id: true, userId: true, workspaceId: true, role: true, workspace: { select: { name: true } }, user: { select: { email: true, name: true } } } } },
  });
  if (!session || session.revokedAt || session.expiresAt <= now) return null;
  if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_AFTER_MS) await db.session.update({ where: { id: session.id }, data: { lastSeenAt: now } }).catch(() => undefined);
  const { membership } = session;
  return { sessionId: session.id, membershipId: membership.id, userId: membership.userId, workspaceId: membership.workspaceId, role: membership.role, workspaceName: membership.workspace.name, email: membership.user.email, name: membership.user.name };
}

export async function sessionToken() {
  return (await cookies()).get(SESSION_COOKIE_NAME)?.value;
}

export async function startSession(membershipId: string, db: Db = getPrisma()) {
  const token = randomBytes(32).toString("base64url");
  await db.session.create({ data: { tokenHash: hashSessionToken(token), membershipId, expiresAt: new Date(Date.now() + SESSION_LIFETIME_SECONDS * 1000) } });
  (await cookies()).set(SESSION_COOKIE_NAME, token, { ...cookieOptions(), maxAge: SESSION_LIFETIME_SECONDS });
}

/** Revokes the server-side session first, then clears the cookie with the same attributes it was set with. */
export async function endSession() {
  const token = await sessionToken();
  if (token) await getPrisma().session.updateMany({ where: { tokenHash: hashSessionToken(token), revokedAt: null }, data: { revokedAt: new Date() } });
  (await cookies()).set(SESSION_COOKIE_NAME, "", { ...cookieOptions(), maxAge: 0 });
}

export function revokeMembershipSessions(db: Db, membershipId: string) {
  return db.session.updateMany({ where: { membershipId, revokedAt: null }, data: { revokedAt: new Date() } });
}
