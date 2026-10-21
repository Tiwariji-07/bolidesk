import Link from "next/link";
import { EmptyState, PageHeader, Status } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { currentAccess } from "@/server/access";
import { storedLines } from "@/server/billing";
import { listQuotes } from "@/server/queries";

export default async function QuotesPage() {
  const quotes = await listQuotes((await currentAccess()).workspaceId);
  return <><PageHeader eyebrow="Price it clearly" title="Quotes" action={<Link className="button" href="/jobs">+ New quote from a job</Link>} />
    <section className="panel"><div className="panel-title"><h2>All quotes</h2><span>{quotes.filter((quote) => quote.status === "DRAFT").length} draft</span></div>
      {quotes.length ? <ul className="card-list">{quotes.map((quote) => <li key={quote.id}><Link href={`/quotes/${quote.id}`} className="card-row">
        <div><strong>{quote.number ?? "Draft quote"}</strong><span>{quote.customer.name} · {storedLines(quote.linesJson)[0]?.description || "No lines yet"}</span></div>
        <div className="row-end"><strong>{formatINR(quote.totalPaise)}</strong><Status value={quote.status} /></div>
      </Link></li>)}</ul> : <EmptyState title="No quotes yet" href="/jobs" action="Capture a job">A job note becomes a draft quote you can check and edit.</EmptyState>}
    </section></>;
}
