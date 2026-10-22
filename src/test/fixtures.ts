import { randomUUID } from "node:crypto";
import type { MembershipRole } from "@prisma/client";
import type { Access } from "@/server/access";
import { getPrisma } from "@/server/prisma";
import { hashSessionToken } from "@/server/session";

/** A fresh workspace with one signed-in member per role, for database tests. */
export async function makeShop(name = "Test Shop") {
  const db = getPrisma();
  const workspace = await db.workspace.create({ data: { name, brandName: name } });
  const members = {} as Record<MembershipRole, Access>;
  for (const role of ["OWNER", "ADMIN", "MEMBER"] as const) {
    const user = await db.user.create({ data: { email: `${role.toLowerCase()}-${randomUUID()}@example.test`, passwordHash: "x" } });
    const membership = await db.membership.create({ data: { userId: user.id, workspaceId: workspace.id, role } });
    const session = await db.session.create({ data: { tokenHash: hashSessionToken(randomUUID()), membershipId: membership.id, expiresAt: new Date(Date.now() + 3_600_000) } });
    members[role] = { sessionId: session.id, membershipId: membership.id, userId: user.id, workspaceId: workspace.id, role, workspaceName: name, email: user.email, name: null };
  }
  return { workspace, ...members, owner: members.OWNER, office: members.ADMIN, technician: members.MEMBER };
}
