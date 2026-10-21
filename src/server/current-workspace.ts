import { redirect } from "next/navigation";
import { getPrisma } from "./prisma";
import { sessionUserId } from "./session";

async function findMembership(userId: string) {
  return getPrisma().membership.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { workspaceId: true, role: true, workspace: { select: { name: true } } },
  });
}

export async function currentMembership() {
  const userId = await sessionUserId();
  if (!userId) redirect("/login");
  const membership = await findMembership(userId);
  if (!membership) redirect("/login?error=no-workspace");
  return membership;
}

/** Workspace identity is derived exclusively from the signed session's database membership. */
export async function currentWorkspaceId() {
  return (await currentMembership()).workspaceId;
}

/** For route handlers: returns null instead of redirecting, so the handler can answer 401. */
export async function apiMembership() {
  const userId = await sessionUserId();
  return userId ? findMembership(userId) : null;
}
