import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { addDays, businessDate, isIsoDate } from "@/domain/business-time";
import { formatDay, formatINR, formatTime } from "@/lib/format";
import { pageAccess } from "@/server/access";
import { dayBook, receivablesAgeing } from "@/server/reports";

const METHOD_LABEL: Record<string, string> = { CASH: "Cash", UPI: "UPI", CARD: "Card", BANK: "Bank transfer", RAZORPAY: "Online (Razorpay)", EARLIER: "Recorded before the ledger" };

export default async function DayBookPage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const access = await pageAccess("ledger.view");
  const requested = (await searchParams).day;
  const day = requested && isIsoDate(requested) ? requested : businessDate();
  const [book, ageing] = await Promise.all([dayBook(access.workspaceId, day), receivablesAgeing(access.workspaceId)]);
  const month = day.slice(0, 7);
  return <><PageHeader eyebrow="Close the day" title="Day book" action={<form className="form-actions no-print"><label className="sr-only" htmlFor="day">Day</label><input id="day" name="day" type="date" defaultValue={day} /><button className="secondary small">Show</button></form>} />
    <nav className="form-actions no-print" aria-label="Day"><Link className="text-link-ink" href={`/reports?day=${addDays(day, -1)}`}>← Previous day</Link><Link className="text-link-ink" href={`/reports?day=${addDays(day, 1)}`}>Next day →</Link><a className="text-link-ink" href={`/reports/export?from=${month}-01&to=${addDays(`${month}-01`, 40).slice(0, 7)}-01`}>Download {month} sales register (CSV)</a></nav>
    <section className="command"><div><p className="eyebrow">{formatDay(new Date(`${day}T00:00:00Z`))}</p><h2>{formatINR(book.collected)} collected</h2><p>{book.byMethod.map(([method, amount]) => `${METHOD_LABEL[method] ?? method} ${formatINR(amount)}`).join(" · ") || "No payments this day."}</p></div></section>
    <section className="split">
      <div className="panel"><div className="panel-title"><h2>Payments</h2><span>{book.payments.length} entries</span></div>
        <ul className="card-list">{book.payments.map((payment) => <li key={payment.id}><Link className="card-row" href={`/invoices/${payment.invoice.id}`}><div><strong>{formatTime(payment.occurredAt)} · {payment.receiptNumber ?? payment.entryKind.toLowerCase()}</strong><span>{payment.invoice.customer.name} · {payment.invoice.number} · {METHOD_LABEL[payment.method ?? "EARLIER"]}{payment.recordedBy ? ` · ${payment.recordedBy.name ?? payment.recordedBy.email}` : ""}</span></div><strong>{formatINR(payment.amountPaise)}</strong></Link></li>)}</ul>
      </div>
      <div className="panel"><div className="panel-title"><h2>Billed</h2><span>{book.invoices.length} invoices</span></div>
        <dl className="doc-totals" style={{ margin: 0, maxWidth: "none" }}><div><dt>Taxable value</dt><dd>{formatINR(book.billed.taxable)}</dd></div><div><dt>CGST</dt><dd>{formatINR(book.billed.cgst)}</dd></div><div><dt>SGST</dt><dd>{formatINR(book.billed.sgst)}</dd></div><div><dt>IGST</dt><dd>{formatINR(book.billed.igst)}</dd></div>{book.billed.unsplit > 0 && <div><dt>GST not split (older invoices)</dt><dd>{formatINR(book.billed.unsplit)}</dd></div>}<div className="grand"><dt>Invoiced</dt><dd>{formatINR(book.billed.total)}</dd></div>{book.credited > 0 && <div><dt>Credit notes</dt><dd>−{formatINR(book.credited)}</dd></div>}</dl>
        <ul className="card-list" style={{ marginTop: 12 }}>{book.invoices.map((invoice) => <li key={invoice.id}><Link className="card-row" href={`/invoices/${invoice.id}`}><div><strong>{invoice.number}</strong><span>{invoice.customer.name}</span></div><strong>{formatINR(invoice.totalPaise)}</strong></Link></li>)}{book.creditNotes.map((note) => <li key={note.id}><div className="card-row"><div><strong>{note.number}</strong><span>Cancels {note.invoice.number}</span></div><strong>−{formatINR(note.totalPaise)}</strong></div></li>)}</ul>
      </div>
    </section>
    <section className="panel"><div className="panel-title"><h2>Money owed to you now</h2><span>By days past due</span></div>
      <dl className="totals"><div><dt>Not yet due</dt><dd>{formatINR(ageing.current)}</dd></div><div><dt>1–30 days late</dt><dd>{formatINR(ageing.upTo30)}</dd></div><div><dt>31–60 days late</dt><dd>{formatINR(ageing.upTo60)}</dd></div><div><dt>Over 60 days</dt><dd>{formatINR(ageing.over60)}</dd></div></dl>
    </section></>;
}
