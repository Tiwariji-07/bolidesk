import { Prisma } from "@prisma/client";
import { AccessError, can, type Access, type Permission } from "./access";
import { getPrisma } from "./prisma";

export type Tx = Prisma.TransactionClient;
export type Actor = { workspaceId: string; userId: string | null; role: Access["role"] | null };

const RETRYABLE = new Set(["P2034", "40001", "40P01"]);

function retryable(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return RETRYABLE.has(error.code) || RETRYABLE.has(String((error.meta as { code?: unknown } | undefined)?.code));
  return /deadlock detected|could not serialize/i.test(String((error as Error | null)?.message));
}

/**
 * Every billing write runs here: one transaction that first locks the workspace row, so numbering,
 * payment sums and status changes in one shop are serialized. Only the database work is retried,
 * so callers must keep provider calls (Razorpay, WhatsApp, OpenAI) outside.
 */
async function locked<T>(workspaceId: string, body: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attemptNumber = 1; ; attemptNumber += 1) {
    try {
      return await getPrisma().$transaction(async (tx) => {
        const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Workspace" WHERE "id" = ${workspaceId} FOR UPDATE`;
        if (rows.length !== 1) throw new AccessError("Workspace not found.", 404);
        return body(tx);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10_000, timeout: 20_000 });
    } catch (error) {
      if (attemptNumber >= 3 || !retryable(error)) throw error;
    }
  }
}

/** A staff write: re-checks the session and role after taking the lock, so a removed member cannot finish a write. */
export function withStaffLock<T>(access: Access, permission: Permission, body: (tx: Tx, actor: Actor) => Promise<T>): Promise<T> {
  return locked(access.workspaceId, async (tx) => {
    const session = await tx.session.findFirst({
      where: { id: access.sessionId, revokedAt: null, expiresAt: { gt: new Date() }, membership: { workspaceId: access.workspaceId } },
      select: { membership: { select: { userId: true, role: true } } },
    });
    if (!session) throw new AccessError("Your session has ended. Sign in again.", 401);
    if (!can(session.membership, permission)) throw new AccessError();
    return body(tx, { workspaceId: access.workspaceId, userId: session.membership.userId, role: session.membership.role });
  });
}

/** A system write (webhook, automatic follow-up): same lock, no user. */
export function withSystemLock<T>(workspaceId: string, body: (tx: Tx, actor: Actor) => Promise<T>): Promise<T> {
  return locked(workspaceId, (tx) => body(tx, { workspaceId, userId: null, role: null }));
}

export function logActivity(tx: Tx, actor: Actor, body: string) {
  return tx.activity.create({ data: { workspaceId: actor.workspaceId, actorUserId: actor.userId, body } });
}
