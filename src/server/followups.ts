import { z } from "zod";
import { addDays, businessDate, istInstant } from "@/domain/business-time";
import type { Access } from "./access";
import { UserError } from "./errors";
import { logActivity, withStaffLock } from "./workspace-tx";

export const followUpInputSchema = z.object({
  subject: z.string().trim().min(3).max(240),
  action: z.string().trim().min(3).max(1000),
  dueAt: z.coerce.date(),
});

export function createFollowUp(access: Access, raw: z.input<typeof followUpInputSchema>) {
  const input = followUpInputSchema.parse(raw);
  return withStaffLock(access, "followups.write", async (tx, actor) => {
    const followUp = await tx.followUp.create({ data: { workspaceId: actor.workspaceId, ...input } });
    await logActivity(tx, actor, `Follow-up created: ${followUp.subject}`);
    return followUp;
  });
}

/** Snooze to 9:00 IST on the next Indian calendar day, whatever the server's time zone. */
export function snoozeFollowUp(access: Access, id: string, now = new Date()) {
  const until = istInstant(addDays(businessDate(now), 1), 9);
  return withStaffLock(access, "followups.write", async (tx, actor) => {
    const result = await tx.followUp.updateMany({ where: { id, workspaceId: actor.workspaceId, status: { not: "DONE" } }, data: { status: "SNOOZED", snoozedUntil: until, dueAt: until } });
    if (result.count !== 1) throw new UserError("Follow-up not found.");
    const followUp = await tx.followUp.findUniqueOrThrow({ where: { id } });
    await logActivity(tx, actor, `Follow-up snoozed: ${followUp.subject}`);
  });
}

export function completeFollowUp(access: Access, id: string) {
  return withStaffLock(access, "followups.write", async (tx, actor) => {
    const result = await tx.followUp.updateMany({ where: { id, workspaceId: actor.workspaceId, status: { not: "DONE" } }, data: { status: "DONE" } });
    if (result.count !== 1) throw new UserError("Follow-up not found.");
    const followUp = await tx.followUp.findUniqueOrThrow({ where: { id } });
    await logActivity(tx, actor, `Follow-up completed: ${followUp.subject}`);
  });
}
