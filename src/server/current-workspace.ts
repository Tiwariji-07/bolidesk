import { getPrisma } from "./prisma";

/** The only current demo auth boundary; replace this resolver when real auth ships. */
export async function currentWorkspaceId() {
  const id = process.env.DEMO_WORKSPACE_ID || "demo-workspace";
  const workspace = await getPrisma().workspace.findFirst({ where: { id }, select: { id: true } });
  if (!workspace) throw new Error("Demo workspace is missing. Run npm run db:setup.");
  return workspace.id;
}
