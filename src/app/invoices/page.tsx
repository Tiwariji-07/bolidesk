import Link from "next/link";
import { EmptyState, PageHeader, Status } from "@/components/ui";
import { formatDay, formatINR } from "@/lib/format";
import { currentAccess } from "@/server/access";
import { storedLines } from "@/server/billing";
import { listInvoices } from "@/server/queries";

export default async function InvoicesPage() {
  const invoices = await listInvoices((await currentAccess()).workspaceId);
  const due = invoices.reduce((sum, invoice) => sum + invoice.balance.due, 0);
  return <><PageHeader eyebrow="Collect without chasing" title="Invoices" action={<Link className="button" href="/customers">+ New invoice</Link>} />
    <section className="panel"><div className="panel-title"><h2>Invoice register</h2><span>{formatINR(due)} to collect</span></div>
      {invoices.length ? <ul className="card-list">{invoices.map((invoice) => <li key={invoice.id}><Link href={`/invoices/${invoice.id}`} className="card-row">
        <div><strong>{invoice.number ?? "Draft invoice"}</strong><span>{invoice.customer.name} · {storedLines(invoice.linesJson)[0]?.description || "No lines yet"}</span></div>
        <div className="row-end"><strong>{formatINR(invoice.totalPaise)}</strong><span><Status value={invoice.displayStatus} /> {invoice.dueDate && invoice.status !== "DRAFT" ? `due ${formatDay(invoice.dueDate)}` : ""}</span></div>
      </Link></li>)}</ul> : <EmptyState title="No invoices yet" href="/customers" action="Pick a customer">Start an invoice from a customer or convert an accepted quote.</EmptyState>}
    </section></>;
}
