import Link from "next/link";
import { notFound } from "next/navigation";
import { createPaymentRequestAction, issueInvoiceAction, recordFullPaymentAction, sharePortalLinkAction } from "@/app/actions";
import { ActionButton } from "@/components/action-button";
import { buyerFromSnapshot, DocumentView, sellerFromSnapshot } from "@/components/document-view";
import { LineEditor } from "@/components/line-editor";
import { PrintButton } from "@/components/print-button";
import { PageHeader, Status } from "@/components/ui";
import { toIsoDate } from "@/domain/business-time";
import { ALLOWED_RATES, type GstScheme } from "@/domain/gst";
import { formatINR } from "@/lib/format";
import { can, currentAccess } from "@/server/access";
import { sellerProblems, storedLines, type BuyerSnapshot, type SellerSnapshot } from "@/server/billing";
import { getInvoice, getWorkspace } from "@/server/queries";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await currentAccess();
  const [invoice, workspace] = await Promise.all([getInvoice(access.workspaceId, id), getWorkspace(access.workspaceId)]);
  if (!invoice) notFound();
  const lines = storedLines(invoice.linesJson);

  if (invoice.status === "DRAFT") {
    const problems = sellerProblems(workspace);
    const editable = can(access, "invoices.write");
    return <><PageHeader eyebrow={`Draft invoice for ${invoice.customer.name}`} title="Draft invoice" action={<Link className="button secondary" href={`/customers/${invoice.customer.id}`}>Customer</Link>} />
      {invoice.quote && <p className="muted">From quote <Link className="text-link-ink" href={`/quotes/${invoice.quote.id}`}>{invoice.quote.number}</Link>.</p>}
      {editable ? <LineEditor kind="invoice" id={invoice.id} version={invoice.version} lines={lines} dueDate={invoice.dueDate ? toIsoDate(invoice.dueDate) : null} placeOfSupply={invoice.placeOfSupply} paymentTerms={invoice.paymentTerms} seller={{ stateCode: workspace.stateCode, gstScheme: workspace.gstScheme as GstScheme | null, rates: ALLOWED_RATES[workspace.gstRateProfile] }} defaultRate={workspace.defaultTaxRate} defaultCode={workspace.defaultCode} />
        : <p className="notice">The office prepares this invoice. You can record a cash payment once it has lines.</p>}
      <section className="panel"><div className="panel-title"><h2>Issue</h2><span>Numbers are given when an invoice is issued</span></div>
        {problems.length ? <ul className="notice error-notice">{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul> : <p className="muted">Issuing freezes the lines, your business details and the customer&apos;s details, and gives the next number in this financial year.</p>}
        <div className="form-actions">
          {editable && <ActionButton action={issueInvoiceAction.bind(null, invoice.id, invoice.version)} label="Issue invoice" pendingLabel="Issuing…" confirmText="Issue this invoice? It cannot be edited afterwards." />}
          {can(access, "payments.cash") && invoice.totalPaise > 0 && <ActionButton variant="secondary" action={recordFullPaymentAction.bind(null, invoice.id)} label={`Cash received, ${formatINR(invoice.totalPaise)}`} pendingLabel="Recording…" confirmText="Issue the invoice and record full cash payment?" />}
        </div>
      </section></>;
  }

  const seller = sellerFromSnapshot(invoice.sellerSnapshot as SellerSnapshot | null, { name: workspace.legalName ?? workspace.name, brandName: workspace.brandName });
  const buyer = buyerFromSnapshot(invoice.buyerSnapshot as BuyerSnapshot | null, invoice.customer);
  const legacy = Boolean((invoice.sellerSnapshot as SellerSnapshot | null)?.legacy);
  const open = invoice.balance.due > 0 && invoice.status === "SENT";
  return <><PageHeader eyebrow={`Invoice for ${invoice.customer.name}`} title={invoice.number ?? "Invoice"} action={<div className="form-actions no-print"><PrintButton /><Status value={invoice.displayStatus} /></div>} />
    {open && <section className="panel no-print"><div className="panel-title"><h2>{formatINR(invoice.balance.due)} to collect</h2><span>Share a link or record what you received</span></div><div className="form-actions">
      {can(access, "payments.request") && <ActionButton action={createPaymentRequestAction.bind(null, invoice.id)} label="Payment link" pendingLabel="Preparing…" linkLabel="Payment link for the customer" whatsappText={`Invoice ${invoice.number} from ${workspace.brandName}:`} />}
      {can(access, "portal.share") && <ActionButton variant="secondary" action={sharePortalLinkAction.bind(null, { invoiceId: invoice.id })} label="Invoice link" pendingLabel="Preparing…" linkLabel="Private invoice link, valid 30 days" whatsappText={`Invoice ${invoice.number} from ${workspace.brandName}:`} />}
      {can(access, "payments.cash") && <ActionButton variant="secondary" action={recordFullPaymentAction.bind(null, invoice.id)} label="Record full payment" pendingLabel="Recording…" confirmText={`Record ${formatINR(invoice.balance.due)} received?`} />}
    </div></section>}
    <DocumentView title={invoice.documentType === "BILL_OF_SUPPLY" ? "Bill of Supply" : "Tax Invoice"} number={invoice.number} issued={invoice.issueDate} due={invoice.dueDate} seller={seller} buyer={buyer} placeOfSupply={invoice.placeOfSupply} lines={lines} terms={invoice.paymentTerms} legacy={legacy}
      heads={{ subtotal: invoice.subtotalPaise, cgst: invoice.cgstPaise, sgst: invoice.sgstPaise, igst: invoice.igstPaise, tax: invoice.taxPaise, total: invoice.totalPaise }}
      footer={invoice.documentType === "BILL_OF_SUPPLY" ? <p className="muted">{seller.gstin ? "Composition taxable person, not eligible to collect tax on supplies." : "Supplier not registered under GST. No GST charged."}</p> : null} />
  </>;
}
