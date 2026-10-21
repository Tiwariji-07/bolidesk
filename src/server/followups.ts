import { z } from "zod";
import { addDays, businessDate, dateOnly, istInstant, toIsoDate } from "@/domain/business-time";
import { balanceOf } from "@/domain/documents";
import { formatINR } from "@/lib/format";
import type { Access } from "./access";
import { UserError } from "./errors";
import { logActivity, withStaffLock, withSystemLock } from "./workspace-tx";

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

const lastSync = new Map<string, number>();

/**
 * Lazy, no cron: when staff open the dashboard, invoices or follow-ups, every issued invoice past its due date
 * (IST) with money still owed gets one follow-up at 9:00 IST the day after it fell due. The unique invoiceId
 * makes this safe to run from several pages at once; completed or snoozed follow-ups are left alone.
 */
export async function ensureOverdueFollowUps(workspaceId: string, now = new Date()) {
  if (now.getTime() - (lastSync.get(workspaceId) ?? 0) < 60_000) return;
  lastSync.set(workspaceId, now.getTime());
  const today = dateOnly(businessDate(now));
  // Candidates are read inside the lock, so an invoice paid or credited a moment ago is not given a reminder.
  await withSystemLock(workspaceId, async (tx) => {
    const candidates = await tx.invoice.findMany({
      where: { workspaceId, status: "SENT", dueDate: { lt: today }, followUp: null },
      select: { id: true, number: true, totalPaise: true, dueDate: true, customer: { select: { name: true } }, payments: { select: { amountPaise: true } }, creditNote: { select: { totalPaise: true } } },
    });
    const overdue = candidates.filter((invoice) => balanceOf(invoice.totalPaise, invoice.creditNote?.totalPaise ?? 0, invoice.payments.reduce((sum, payment) => sum + payment.amountPaise, 0)).due > 0);
    if (!overdue.length) return;
    await tx.followUp.createMany({
      skipDuplicates: true,
      data: overdue.map((invoice) => ({
        workspaceId, invoiceId: invoice.id,
        subject: `${invoice.number} · ${invoice.customer.name}`,
        action: `Payment overdue (${formatINR(invoice.totalPaise)} invoice). Send a reminder with the payment link.`,
        dueAt: istInstant(addDays(toIsoDate(invoice.dueDate!), 1), 9),
      })),
    });
  });
}
