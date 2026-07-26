import Link from "next/link";
import { invoices } from "@/lib/demo-data";
import { formatINR, formatDate } from "@/lib/format";
import { PageHeader, Status } from "@/components/ui";

export default function InvoicesPage() { return <><PageHeader eyebrow="Collect without chasing" title="Invoices" action={<Link className="button" href="/jobs">+ New invoice</Link>} /><section className="panel"><div className="panel-title"><h2>Invoice register</h2><span>{formatINR(invoices.filter((x) => x.status !== "PAID").reduce((s, x) => s + x.total, 0))} open</span></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Invoice</th><th>Customer</th><th>Due</th><th>Status</th><th>Total</th></tr></thead><tbody>{invoices.map((invoice) => <tr key={invoice.id}><td><Link href={`/invoices/${invoice.number}`}><strong>{invoice.number}</strong></Link><br /><span className="muted">{invoice.service}</span></td><td>{invoice.customer}</td><td>{formatDate(invoice.due)}</td><td><Status value={invoice.status} /></td><td><strong>{formatINR(invoice.total)}</strong></td></tr>)}</tbody></table></div></section></> }
