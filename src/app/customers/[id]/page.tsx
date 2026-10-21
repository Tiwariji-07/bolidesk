import Link from "next/link";
import { notFound } from "next/navigation";
import { createBlankInvoiceAction, createBlankQuoteAction } from "@/app/actions";
import { ActionButton } from "@/components/action-button";
import { CustomerForm } from "@/components/customer-form";
import { PageHeader, Status } from "@/components/ui";
import { STATES } from "@/domain/gst";
import { formatPhone, whatsappRecipient } from "@/domain/phone";
import { formatINR } from "@/lib/format";
import { can, currentAccess } from "@/server/access";
import { getPrisma } from "@/server/prisma";
import { getCustomer, listInvoices, withBalance } from "@/server/queries";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await currentAccess();
  const customer = await getCustomer(access.workspaceId, id);
  if (!customer) notFound();
  const [quotes, invoices] = await Promise.all([
    getPrisma().quote.findMany({ where: { workspaceId: access.workspaceId, customerId: id }, orderBy: { createdAt: "desc" }, take: 20 }),
    getPrisma().invoice.findMany({ where: { workspaceId: access.workspaceId, customerId: id }, include: { payments: { select: { amountPaise: true } } }, orderBy: { createdAt: "desc" }, take: 20 }).then((rows) => rows.map(withBalance)),
  ]);
  const due = (await listInvoices(access.workspaceId)).filter((invoice) => invoice.customerId === id).reduce((sum, invoice) => sum + invoice.balance.due, 0);
  return <><PageHeader eyebrow="Customer" title={customer.name} action={<div className="form-actions">
      {can(access, "quotes.draft") && <ActionButton action={createBlankQuoteAction.bind(null, customer.id)} label="New quote" next="/quotes/{id}" />}
      {can(access, "invoices.write") && <ActionButton variant="secondary" action={createBlankInvoiceAction.bind(null, customer.id)} label="New invoice" next="/invoices/{id}" />}
    </div>} />
    <section className="split">
      <section className="panel"><div className="panel-title"><h2>Details</h2><a className="text-link-ink" href={`https://wa.me/${whatsappRecipient(customer.phone)}`} target="_blank" rel="noreferrer">WhatsApp</a></div>
        <dl className="details"><dt>Mobile</dt><dd><a href={`tel:${customer.phone}`}>{formatPhone(customer.phone)}</a></dd><dt>Address</dt><dd>{customer.address ?? "Not set"}</dd><dt>State</dt><dd>{customer.stateCode ? STATES[customer.stateCode] : "Same as shop"}</dd>{customer.gstin && <><dt>GSTIN</dt><dd>{customer.gstin}</dd></>}{customer.email && <><dt>Email</dt><dd>{customer.email}</dd></>}</dl>
        {can(access, "customers.write") && <CustomerForm customer={customer} />}
      </section>
      <section className="panel"><div className="panel-title"><h2>{formatINR(due)} outstanding</h2><span>{invoices.length} invoices · {quotes.length} quotes</span></div>
        <ul className="card-list">{invoices.map((invoice) => <li key={invoice.id}><Link className="card-row" href={`/invoices/${invoice.id}`}><div><strong>{invoice.number ?? "Draft invoice"}</strong></div><div className="row-end"><strong>{formatINR(invoice.totalPaise)}</strong><Status value={invoice.displayStatus} /></div></Link></li>)}
          {quotes.map((quote) => <li key={quote.id}><Link className="card-row" href={`/quotes/${quote.id}`}><div><strong>{quote.number ?? "Draft quote"}</strong><span>Quote</span></div><div className="row-end"><strong>{formatINR(quote.totalPaise)}</strong><Status value={quote.status} /></div></Link></li>)}</ul>
      </section>
    </section></>;
}
