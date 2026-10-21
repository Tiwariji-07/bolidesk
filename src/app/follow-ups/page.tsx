import { FollowUpActions, NewFollowUpForm } from "@/components/follow-up-actions";
import { EmptyState, PageHeader, Status } from "@/components/ui";
import { businessDate } from "@/domain/business-time";
import { formatDate, formatTime } from "@/lib/format";
import { can, currentAccess } from "@/server/access";
import { getPrisma } from "@/server/prisma";

export default async function FollowUpsPage() {
  const access = await currentAccess();
  const now = new Date();
  const followUps = await getPrisma().followUp.findMany({ where: { workspaceId: access.workspaceId, OR: [{ status: { not: "DONE" } }, { createdAt: { gt: new Date(now.getTime() - 14 * 86_400_000) } }] }, orderBy: [{ status: "asc" }, { dueAt: "asc" }], take: 100 });
  // A snoozed follow-up is due again once its time arrives.
  const due = followUps.filter((followUp) => followUp.status !== "DONE" && followUp.dueAt <= now);
  return <><PageHeader eyebrow="One sensible next step" title="Follow-ups" action={can(access, "followups.write") ? <NewFollowUpForm today={businessDate(now)} /> : undefined} />
    <section className="panel"><div className="panel-title"><h2>{due.length} due now</h2><span>Earliest first</span></div>
      {followUps.length ? followUps.map((followUp) => <div className="follow-card" key={followUp.id}><div><div className="form-actions"><Status value={followUp.status !== "DONE" && followUp.dueAt <= now ? "OVERDUE" : followUp.status} /><span className="muted">{formatDate(followUp.dueAt)}, {formatTime(followUp.dueAt)}</span></div><h3>{followUp.subject}</h3><p>{followUp.action}</p></div>{followUp.status !== "DONE" && can(access, "followups.write") && <FollowUpActions id={followUp.id} />}</div>)
        : <EmptyState title="Nothing to follow up">Overdue invoices and reminders you add appear here.</EmptyState>}
    </section></>;
}
