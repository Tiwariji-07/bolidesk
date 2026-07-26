import { redirect } from "next/navigation";
import { getPrisma } from "./prisma";
import { sessionUserId } from "./session";

export async function currentMembership() {
  const userId = await sessionUserId();
  if (!userId) redirect("/login");
  const membership = await getPrisma().membership.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { workspaceId: true, role: true, workspace: { select: { name: true } } },
  });
  if (!membership) redirect("/login?error=no-workspace");
  return membership;
}

/** Workspace identity is derived exclusively from the signed session's database membership. */
export async function currentWorkspaceId() {
  return (await currentMembership()).workspaceId;
}
