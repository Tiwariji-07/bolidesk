import Link from "next/link";
import { PageHeader, Status } from "@/components/ui";
import { formatDate, formatINR, formatTime } from "@/lib/format";
import { currentAccess } from "@/server/access";
import { ensureOverdueFollowUps } from "@/server/followups";
import { listActivities, listInvoices, listQuotes } from "@/server/queries";

export default async function Dashboard() {
  const access = await currentAccess();
  await ensureOverdueFollowUps(access.workspaceId);
  const [invoices, quotes, activities] = await Promise.all([listInvoices(access.workspaceId), listQuotes(access.workspaceId), listActivities(access.workspaceId)]);
  const open = invoices.filter((invoice) => invoice.balance.due > 0 && invoice.status === "SENT");
  const overdue = open.filter((invoice) => invoice.displayStatus === "OVERDUE");
  const sum = (rows: typeof invoices) => rows.reduce((total, invoice) => total + invoice.balance.due, 0);
  const drafts = invoices.filter((invoice) => invoice.status === "DRAFT").length + quotes.filter((quote) => quote.status === "DRAFT").length;
  const waiting = quotes.filter((quote) => quote.status === "SENT");
  return <><PageHeader eyebrow={access.workspaceName} title="Keep today moving" action={<Link href="/jobs" className="button">+ Capture a job</Link>} />
    <section className="command"><div><p className="eyebrow">Cash desk</p><h2>{formatINR(sum(open))} to collect</h2><p>{open.length ? `${open.length} issued invoice${open.length === 1 ? "" : "s"} unpaid${overdue.length ? `, ${overdue.length} overdue` : ""}.` : "Nothing waiting to be collected."}</p></div><Link href="/follow-ups" className="text-link">Open follow-up queue →</Link></section>
    <section className="split">
      <div className="panel"><div className="panel-title"><h2>Today</h2><span>Live</span></div>
        <dl className="totals"><div><dt>Overdue</dt><dd>{formatINR(sum(overdue))}</dd><small>{overdue.length} invoices past due</small></div><div><dt>Quotes waiting</dt><dd>{waiting.length}</dd><small>sent, no answer yet</small></div><div><dt>Drafts</dt><dd>{drafts}</dd><small>quotes and invoices to finish</small></div></dl>
        <ul className="card-list" style={{ marginTop: 14 }}>{overdue.slice(0, 5).map((invoice) => <li key={invoice.id}><Link className="card-row" href={`/invoices/${invoice.id}`}><div><strong>{invoice.number}</strong><span>{invoice.customer.name}</span></div><div className="row-end"><strong>{formatINR(invoice.balance.due)}</strong><Status value="OVERDUE" /></div></Link></li>)}</ul>
      </div>
      <div className="panel"><div className="panel-title"><h2>Recent activity</h2></div>
        <ol className="timeline">{activities.map((activity) => <li key={activity.id}><time dateTime={activity.createdAt.toISOString()}>{formatDate(activity.createdAt)}<br />{formatTime(activity.createdAt)}</time><span>{activity.body}{activity.actor ? <span className="muted"> · {activity.actor.name ?? activity.actor.email}</span> : null}</span></li>)}</ol>
      </div>
    </section></>;
}
