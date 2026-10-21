import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buyerFromSnapshot, DocumentView, sellerFromSnapshot } from "@/components/document-view";
import { calculateDocument } from "@/domain/gst";
import { formatDay, formatINR } from "@/lib/format";
import { frozenHeads, storedLines, workspaceMode, type BuyerSnapshot, type SellerSnapshot } from "@/server/billing";
import { resolvePortalToken } from "@/server/portal";
import { getPrisma } from "@/server/prisma";
import { getWorkspace, invoiceBalance } from "@/server/queries";

export const metadata: Metadata = { title: "Your document", referrer: "no-referrer", robots: { index: false, follow: false } };

/** Customer view: authorized only by the opaque token, never by an id in the URL. */
export default async function CustomerPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await resolvePortalToken(token);
  if (!portal) notFound();
  const workspace = await getWorkspace(portal.workspaceId);
  const { invoice, quote } = portal;
  if (invoice && invoice.status !== "DRAFT") {
    const [payments, request, creditNote] = await Promise.all([
      getPrisma().payment.findMany({ where: { invoiceId: invoice.id }, select: { amountPaise: true } }),
      getPrisma().paymentRequest.findFirst({ where: { invoiceId: invoice.id, status: "ACTIVE", expiresAt: { gt: new Date() } }, select: { url: true } }),
      getPrisma().creditNote.findUnique({ where: { invoiceId: invoice.id }, select: { totalPaise: true, number: true } }),
    ]);
    const balance = invoiceBalance({ ...invoice, payments, creditNote });
    const seller = sellerFromSnapshot(invoice.sellerSnapshot as SellerSnapshot | null, { name: workspace.legalName ?? workspace.name, brandName: workspace.brandName });
    return <main id="main-content" className="portal-page"><section className="portal-wide">
      <p className="eyebrow">{workspace.brandName}</p><h1>{creditNote ? `Cancelled by credit note ${creditNote.number}` : balance.due === 0 ? "Paid, thank you" : `${formatINR(balance.due)} due`}</h1>
      <p>Hello {portal.customer.name}. {balance.due === 0 ? "We have received your payment." : invoice.dueDate ? `Please pay by ${formatDay(invoice.dueDate)}.` : ""}</p>
      {balance.due > 0 && request?.url && <p><a className="button-link" href={request.url} rel="noreferrer">Pay {formatINR(balance.due)} by UPI, card or net banking</a></p>}
      {balance.due > 0 && request && !request.url && <p className="notice">Demo payment link: no money is collected in demo mode.</p>}
      <DocumentView title={invoice.documentType === "BILL_OF_SUPPLY" ? "Bill of Supply" : "Tax Invoice"} number={invoice.number} issued={invoice.issueDate} due={invoice.dueDate} seller={seller} buyer={buyerFromSnapshot(invoice.buyerSnapshot as BuyerSnapshot | null, { name: portal.customer.name })} placeOfSupply={invoice.placeOfSupply} lines={storedLines(invoice.linesJson)} terms={invoice.paymentTerms} heads={{ subtotal: invoice.subtotalPaise, cgst: invoice.cgstPaise, sgst: invoice.sgstPaise, igst: invoice.igstPaise, tax: invoice.taxPaise, total: invoice.totalPaise }} />
      <p className="muted">This private link expires {formatDay(portal.expiresAt)}.</p>
    </section></main>;
  }
  if (!quote || quote.status === "DRAFT") notFound();
  const lines = storedLines(quote.linesJson);
  const totals = frozenHeads(quote.linesJson) ?? calculateDocument(lines, workspaceMode(workspace, quote.placeOfSupply));
  return <main id="main-content" className="portal-page"><section className="portal-wide">
    <p className="eyebrow">{workspace.brandName}</p><h1>Quote {quote.number}</h1><p>Hello {portal.customer.name}, here is our quote. Reply on WhatsApp to go ahead.</p>
    <DocumentView title="Quotation" number={quote.number} issued={quote.createdAt} due={quote.dueDate} seller={{ name: workspace.legalName ?? workspace.name, tradeName: workspace.brandName, address: workspace.address, stateCode: workspace.stateCode, gstin: workspace.gstScheme === "UNREGISTERED" ? null : workspace.gstin }} buyer={{ name: portal.customer.name }} placeOfSupply={quote.placeOfSupply} lines={totals.lines} heads={totals} />
    <p className="muted">This private link expires {formatDay(portal.expiresAt)}.</p>
  </section></main>;
}
