import type { JobStatus } from "@prisma/client";
import { AccessError, can, type Access } from "./access";
import { UserError } from "./errors";
import { logActivity, withStaffLock } from "./workspace-tx";

/** Office/owner: give a job to a team member and set the visit time. The assignee must be on this shop's team. */
export function scheduleJob(access: Access, jobId: string, input: { assigneeUserId: string | null; scheduledAt: Date | null }) {
  return withStaffLock(access, "jobs.assign", async (tx, actor) => {
    const job = await tx.job.findFirst({ where: { id: jobId, workspaceId: actor.workspaceId }, include: { customer: { select: { name: true } } } });
    if (!job) throw new UserError("Job not found.");
    if (job.status === "DONE" || job.status === "CANCELLED") throw new UserError("This job is closed.");
    const assignee = input.assigneeUserId ? await tx.membership.findFirst({ where: { workspaceId: actor.workspaceId, userId: input.assigneeUserId }, include: { user: { select: { name: true, email: true } } } }) : null;
    if (input.assigneeUserId && !assignee) throw new UserError("That person is not on your team.");
    await tx.job.update({ where: { id: job.id }, data: { assigneeUserId: input.assigneeUserId, scheduledAt: input.scheduledAt, status: input.scheduledAt || input.assigneeUserId ? "SCHEDULED" : "OPEN" } });
    await logActivity(tx, actor, `Job for ${job.customer?.name ?? "a customer"} ${assignee ? `given to ${assignee.user.name ?? assignee.user.email}` : "unassigned"}`);
  });
}

/** Technicians close their own visits; the office can close or reopen any job. */
export function setJobStatus(access: Access, jobId: string, status: Extract<JobStatus, "OPEN" | "DONE" | "CANCELLED">) {
  return withStaffLock(access, "jobs.write", async (tx, actor) => {
    const job = await tx.job.findFirst({ where: { id: jobId, workspaceId: actor.workspaceId }, include: { customer: { select: { name: true } } } });
    if (!job) throw new UserError("Job not found.");
    const office = can({ role: actor.role! }, "jobs.assign");
    if (!office && (status !== "DONE" || (job.assigneeUserId && job.assigneeUserId !== actor.userId))) throw new AccessError("Only the office can change someone else's job.");
    await tx.job.update({ where: { id: job.id }, data: { status: status === "OPEN" && job.scheduledAt ? "SCHEDULED" : status, doneAt: status === "DONE" ? new Date() : null } });
    await logActivity(tx, actor, `Job for ${job.customer?.name ?? "a customer"} marked ${status === "OPEN" ? "open again" : status.toLowerCase()}`);
  });
}
