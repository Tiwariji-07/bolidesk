import Link from "next/link";
import { QuoteActions } from "@/components/quote-actions";
import { EmptyState, PageHeader, Status } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { currentWorkspaceId } from "@/server/current-workspace";
import { forWorkspace } from "@/server/persistence";

function service(lines: unknown) { return (lines as { description?: string }[])[0]?.description ?? "Service"; }
export default async function QuotesPage() {
  const quotes = await forWorkspace(await currentWorkspaceId()).quotes.list();
  return <><PageHeader eyebrow="Price it clearly" title="Quotes" action={<Link className="button" href="/jobs">+ New quote</Link>} /><section className="panel"><div className="panel-title"><h2>All quotes</h2><span>{quotes.filter((quote) => quote.status === "DRAFT").length} draft</span></div>{quotes.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Quote</th><th>Customer</th><th>Work</th><th>Status</th><th>Total</th><th /></tr></thead><tbody>{quotes.map((quote) => <tr key={quote.id}><td><strong>{quote.number}</strong></td><td>{quote.customer.name}</td><td className="muted">{service(quote.linesJson)}</td><td><Status value={quote.status} /></td><td><strong>{formatINR(quote.total)}</strong></td><td><QuoteActions id={quote.id} status={quote.status} /></td></tr>)}</tbody></table></div> : <EmptyState title="No quotes yet" href="/jobs" action="Capture a job">Save a job, then turn its parsed services into a quote.</EmptyState>}</section></>;
}
