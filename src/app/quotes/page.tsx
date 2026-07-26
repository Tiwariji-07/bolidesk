"use client";
import Link from "next/link";
import { useState } from "react";
import { quotes as initialQuotes } from "@/lib/demo-data";
import { formatINR } from "@/lib/format";
import { PageHeader, Status } from "@/components/ui";

export default function QuotesPage() { const [items, setItems] = useState(initialQuotes); function send(id: string) { setItems(items.map((item) => item.id === id ? { ...item, status: "SENT" } : item)); } return <><PageHeader eyebrow="Price it clearly" title="Quotes" action={<Link className="button" href="/jobs">+ New quote</Link>} /><section className="panel"><div className="panel-title"><h2>All quotes</h2><span>{items.filter((x) => x.status === "DRAFT").length} draft</span></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Quote</th><th>Customer</th><th>Work</th><th>Status</th><th>Total</th><th /></tr></thead><tbody>{items.map((quote) => <tr key={quote.id}><td><strong>{quote.number}</strong></td><td>{quote.customer}</td><td className="muted">{quote.service}</td><td><Status value={quote.status} /></td><td><strong>{formatINR(quote.total)}</strong></td><td>{quote.status === "DRAFT" && <button className="button small" onClick={() => send(quote.id)}>Send</button>}{quote.status === "ACCEPTED" && <Link className="button small" href="/invoices/BD-2047">Invoice</Link>}</td></tr>)}</tbody></table></div></section></> }
