import { FollowUpActions } from "@/components/follow-up-actions";
import { EmptyState, PageHeader, Status } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { currentWorkspaceId } from "@/server/current-workspace";
import { forWorkspace } from "@/server/persistence";

export default async function FollowUpsPage() {
  const workspace = forWorkspace(await currentWorkspaceId());
  const [followUps, activities] = await Promise.all([workspace.followUps.list(), workspace.activities.list()]);
  const open = followUps.filter((followUp) => followUp.status === "OPEN");
  return <><PageHeader eyebrow="One sensible next step" title="Follow-up queue" /><section className="panel"><div className="panel-title"><h2>{open.length} open follow-ups</h2><span>Due date first</span></div>{followUps.length ? followUps.map((followUp) => <div className="follow-card" key={followUp.id}><div><div className="form-actions"><Status value={followUp.status === "OPEN" && followUp.dueAt < new Date() ? "OVERDUE" : followUp.status} /><span className="muted">Due {formatDate(followUp.dueAt)}</span></div><h3>{followUp.subject}</h3><p>{followUp.action}</p></div>{followUp.status !== "DONE" && <FollowUpActions id={followUp.id} />}</div>) : <EmptyState title="Nothing to follow up" href="/jobs" action="Capture a job">Your reminders will appear here when you create them.</EmptyState>}</section><section className="panel"><div className="panel-title"><h2>Activity timeline</h2></div>{activities.length ? <ol className="timeline">{activities.slice(0, 8).map((activity) => <li key={activity.id}><time>{formatDate(activity.createdAt)}</time><span>{activity.body}</span></li>)}</ol> : <p className="muted">Completed reminders and status changes are recorded here.</p>}</section></>;
}
