import Link from "next/link";
import { notFound } from "next/navigation";
import { createPaymentRequestAction, sharePortalLinkAction } from "@/app/actions";
import { ActionButton } from "@/components/action-button";
import { CreditNoteButton } from "@/components/credit-note-button";
import { buyerFromSnapshot, DocumentView, sellerFromSnapshot } from "@/components/document-view";
import { LineEditor } from "@/components/line-editor";
import { RecordPaymentForm, RefundForm, ReverseReceiptButton } from "@/components/payment-panel";
import { PrintButton } from "@/components/print-button";
import { PageHeader, Status } from "@/components/ui";
import { toIsoDate } from "@/domain/business-time";
import { ALLOWED_RATES, type GstScheme } from "@/domain/gst";
import { formatDate, formatINR } from "@/lib/format";
import { isDemoMode } from "@/server/env";
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
      {editable ? <LineEditor kind="invoice" id={invoice.id} version={invoice.version} lines={lines} dueDate={invoice.dueDate ? toIsoDate(invoice.dueDate) : null} placeOfSupply={invoice.placeOfSupply} paymentTerms={invoice.paymentTerms} seller={{ stateCode: workspace.stateCode, gstScheme: workspace.gstScheme as GstScheme | null, rates: ALLOWED_RATES[workspace.gstRateProfile] }} defaultRate={workspace.defaultTaxRate} defaultCode={workspace.defaultCode} finalize={problems.length ? undefined : { label: "Issue invoice", confirmText: "Issue this invoice? It gets the next number and cannot be edited afterwards." }} />
        : <p className="notice">The office prepares this invoice. You can record a cash payment once it has lines.</p>}
      <section className="panel"><div className="panel-title"><h2>Issue</h2><span>Numbers are given when an invoice is issued</span></div>
        {problems.length ? <ul className="notice error-notice">{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul> : <p className="muted">Issue invoice (in the editor above) freezes the lines, your business details and the customer&apos;s details, and gives the next number in this financial year.</p>}
      </section>
      {can(access, "payments.cash") && invoice.totalPaise > 0 && <section className="panel"><div className="panel-title"><h2>Paid on the spot?</h2><span>Records cash and issues the invoice in one step</span></div><RecordPaymentForm invoiceId={invoice.id} duePaise={invoice.totalPaise} allowNonCash={false} draftVersion={invoice.version} /></section>}</>;
  }

  const seller = sellerFromSnapshot(invoice.sellerSnapshot as SellerSnapshot | null, { name: workspace.legalName ?? workspace.name, brandName: workspace.brandName });
  const buyer = buyerFromSnapshot(invoice.buyerSnapshot as BuyerSnapshot | null, invoice.customer);
  const legacy = Boolean((invoice.sellerSnapshot as SellerSnapshot | null)?.legacy);
  const open = invoice.balance.due > 0 && invoice.status === "SENT";
  return <><PageHeader eyebrow={`Invoice for ${invoice.customer.name}`} title={invoice.number ?? "Invoice"} action={<div className="form-actions no-print"><PrintButton />{!invoice.creditNote && can(access, "credit.issue") && <CreditNoteButton invoiceId={invoice.id} version={invoice.version} number={invoice.number ?? ""} />}<Status value={invoice.displayStatus} /></div>} />
    {invoice.creditNote && <p className="notice no-print">Cancelled by credit note <Link className="text-link-ink" href={`/invoices/${invoice.id}/credit-note`}>{invoice.creditNote.number}</Link>: {invoice.creditNote.reason}{invoice.balance.refundDue ? `. ${formatINR(invoice.balance.refundDue)} received on it is due back to the customer.` : ""}</p>}
    {open && <section className="panel no-print"><div className="panel-title"><h2>{formatINR(invoice.balance.due)} to collect</h2><span>{invoice.paymentRequests[0] ? `Payment link ${invoice.paymentRequests[0].status.toLowerCase()}` : "Share a link or record what you received"}</span></div><div className="form-actions">
      {can(access, "payments.request") && <ActionButton action={createPaymentRequestAction.bind(null, invoice.id)} label={isDemoMode() ? "Payment link (demo)" : "Payment link"} pendingLabel="Preparing…" linkLabel={isDemoMode() ? "Demo: the customer sees the invoice; no money is collected." : "Send this to the customer: invoice with a Razorpay pay button"} whatsappText={`Invoice ${invoice.number} from ${workspace.brandName}, ${formatINR(invoice.balance.due)} due:`} />}
      {can(access, "portal.share") && <ActionButton variant="secondary" action={sharePortalLinkAction.bind(null, { invoiceId: invoice.id })} label="Invoice link only" pendingLabel="Preparing…" linkLabel="Private invoice link, valid 30 days" whatsappText={`Invoice ${invoice.number} from ${workspace.brandName}:`} />}
    </div>
      {can(access, "payments.cash") && <div style={{ marginTop: 16 }}><RecordPaymentForm invoiceId={invoice.id} duePaise={invoice.balance.due} allowNonCash={can(access, "payments.manual")} /></div>}
    </section>}
    {can(access, "ledger.view") && invoice.payments.length > 0 && <section className="panel no-print"><div className="panel-title"><h2>Payments</h2><span>{formatINR(invoice.balance.paid)} received{invoice.balance.refundDue ? `, ${formatINR(invoice.balance.refundDue)} to refund` : ""}</span></div>
      <ul className="card-list">{invoice.payments.map((payment) => <li key={payment.id}><div className="card-row"><div><strong>{payment.receiptNumber ?? (payment.entryKind === "RECEIPT" ? "Opening balance" : payment.entryKind === "REVERSAL" ? "Reversal" : "Refund")}</strong><span>{formatDate(payment.occurredAt)} · {payment.method?.toLowerCase() ?? "earlier record"}{payment.reference ? ` · ${payment.reference}` : ""}{payment.recordedBy ? ` · ${payment.recordedBy.name ?? payment.recordedBy.email}` : ""}{payment.reason ? ` · ${payment.reason}` : ""}</span></div>
        <div className="row-end"><strong>{formatINR(payment.amountPaise)}</strong><span className="form-actions">{payment.receiptNumber && <Link className="text-link-ink" href={`/invoices/${invoice.id}/receipts/${payment.id}`}>Receipt</Link>}{payment.entryKind === "RECEIPT" && payment.source === "MANUAL" && !payment.reversal && can(access, "payments.correct") && <ReverseReceiptButton paymentId={payment.id} invoiceId={invoice.id} />}</span></div></div></li>)}</ul>
      {invoice.balance.refundDue > 0 && can(access, "payments.correct") && <div style={{ marginTop: 14 }}><RefundForm invoiceId={invoice.id} refundDuePaise={invoice.balance.refundDue} /></div>}
    </section>}
    <DocumentView title={invoice.documentType === "BILL_OF_SUPPLY" ? "Bill of Supply" : "Tax Invoice"} number={invoice.number} issued={invoice.issueDate} due={invoice.dueDate} seller={seller} buyer={buyer} placeOfSupply={invoice.placeOfSupply} lines={lines} terms={invoice.paymentTerms} legacy={legacy}
      heads={{ subtotal: invoice.subtotalPaise, cgst: invoice.cgstPaise, sgst: invoice.sgstPaise, igst: invoice.igstPaise, tax: invoice.taxPaise, total: invoice.totalPaise }}
      footer={invoice.documentType === "BILL_OF_SUPPLY" ? <p className="muted">{seller.gstin ? "Composition taxable person, not eligible to collect tax on supplies." : "Supplier not registered under GST. No GST charged."}</p> : null} />
  </>;
}
