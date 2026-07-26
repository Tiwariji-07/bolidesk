import Link from "next/link";
import { EmptyState, PageHeader, Status } from "@/components/ui";
import { formatDate, formatINR } from "@/lib/format";
import { currentWorkspaceId } from "@/server/current-workspace";
import { forWorkspace } from "@/server/persistence";

function service(lines: unknown) { return (lines as { description?: string }[])[0]?.description ?? "Service"; }
export default async function InvoicesPage() {
  const invoices = await forWorkspace(await currentWorkspaceId()).invoices.list();
  const open = invoices.filter((invoice) => invoice.status !== "PAID").reduce((sum, invoice) => sum + invoice.total, 0);
  return <><PageHeader eyebrow="Collect without chasing" title="Invoices" action={<Link className="button" href="/jobs">+ New invoice</Link>} /><section className="panel"><div className="panel-title"><h2>Invoice register</h2><span>{formatINR(open)} open</span></div>{invoices.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Invoice</th><th>Customer</th><th>Due</th><th>Status</th><th>Total</th></tr></thead><tbody>{invoices.map((invoice) => <tr key={invoice.id}><td><Link href={`/invoices/${invoice.number}`}><strong>{invoice.number}</strong></Link><br /><span className="muted">{service(invoice.linesJson)}</span></td><td>{invoice.customer.name}</td><td>{invoice.dueDate ? formatDate(invoice.dueDate) : "On receipt"}</td><td><Status value={invoice.status} /></td><td><strong>{formatINR(invoice.total)}</strong></td></tr>)}</tbody></table></div> : <EmptyState title="No invoices yet" href="/quotes" action="Review quotes">Accept a quote, then convert it into an invoice.</EmptyState>}</section></>;
}
