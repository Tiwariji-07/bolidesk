import Link from "next/link";
import { PageHeader, Status } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { currentWorkspaceId } from "@/server/current-workspace";
import { forWorkspace } from "@/server/persistence";

function service(lines: unknown) {
  const value = lines as { description?: string }[];
  return value[0]?.description ?? "Service";
}

export default async function Dashboard() {
  const workspace = forWorkspace(await currentWorkspaceId());
  const [invoices, quotes, activities] = await Promise.all([workspace.invoices.list(), workspace.quotes.list(), workspace.activities.list()]);
  const openInvoices = invoices.filter((invoice) => invoice.status !== "PAID");
  const due = openInvoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const overdue = invoices.filter((invoice) => invoice.status === "OVERDUE").reduce((sum, invoice) => sum + invoice.total, 0);
  const drafts = quotes.filter((quote) => quote.status === "DRAFT");
  const documents = [...invoices.slice(0, 2), ...quotes.slice(0, 1)];
  return <><PageHeader eyebrow="Your workspace" title="Keep today moving" action={<Link href="/jobs" className="button">+ Capture a job note</Link>} /><section className="command"><div><p className="eyebrow">Cash desk</p><h2>{formatINR(due)} to collect</h2><p>{openInvoices.length ? `${openInvoices.length} invoice${openInvoices.length === 1 ? "" : "s"} need your attention.` : "Nothing waiting to be collected."}</p></div><Link href="/follow-ups" className="text-link">Open follow-up queue →</Link></section><section className="split"><div className="panel"><div className="panel-title"><h2>Actionable totals</h2><span>Live</span></div><dl className="totals"><div><dt>Open invoices</dt><dd>{formatINR(due)}</dd><small>{openInvoices.length} awaiting payment</small></div><div><dt>Overdue</dt><dd>{formatINR(overdue)}</dd><small>{invoices.filter((invoice) => invoice.status === "OVERDUE").length} invoice{invoices.filter((invoice) => invoice.status === "OVERDUE").length === 1 ? "" : "s"}</small></div><div><dt>Draft quotes</dt><dd>{drafts.length}</dd><small>{formatINR(drafts.reduce((sum, quote) => sum + quote.total, 0))} pending</small></div></dl></div><div className="panel"><div className="panel-title"><h2>Recent activity</h2><span className="live-dot">Live workspace</span></div>{activities.length ? <ol className="timeline">{activities.map((activity) => <li key={activity.id}><time>{activity.createdAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</time><span>{activity.body}</span></li>)}</ol> : <p className="muted">Actions you take will appear here.</p>}</div></section><section className="panel"><div className="panel-title"><h2>Open documents</h2><Link href="/invoices">View all</Link></div>{documents.length ? <div className="data-list">{documents.map((doc) => <div className="row" key={doc.id}><div><strong>{doc.number}</strong><span>{doc.customer.name} · {service(doc.linesJson)}</span></div><div className="row-end"><strong>{formatINR(doc.total)}</strong><Status value={doc.status} /></div></div>)}</div> : <p className="muted">Create a job and quote to start tracking documents.</p>}</section></>;
}
