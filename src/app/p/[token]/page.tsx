import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buyerFromSnapshot, DocumentView, sellerFromSnapshot } from "@/components/document-view";
import { calculateDocument } from "@/domain/gst";
import { formatDay, formatINR } from "@/lib/format";
import { storedLines, type BuyerSnapshot, type SellerSnapshot } from "@/server/billing";
import { resolvePortalToken } from "@/server/portal";
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
    const balance = invoiceBalance(invoice);
    const seller = sellerFromSnapshot(invoice.sellerSnapshot as SellerSnapshot | null, { name: workspace.legalName ?? workspace.name, brandName: workspace.brandName });
    return <main id="main-content" className="portal-page"><section className="portal-wide">
      <p className="eyebrow">{workspace.brandName}</p><h1>{invoice.status === "PAID" ? "Paid, thank you" : `${formatINR(balance.due)} due`}</h1>
      <p>Hello {portal.customer.name}. {invoice.status === "PAID" ? "We have received your payment." : invoice.dueDate ? `Please pay by ${formatDay(invoice.dueDate)}.` : ""}</p>
      {invoice.paymentUrl && balance.due > 0 && !invoice.paymentUrl.includes("/p/") && <p><a className="button-link" href={invoice.paymentUrl} rel="noreferrer">Pay {formatINR(balance.due)} securely</a></p>}
      <DocumentView title={invoice.documentType === "BILL_OF_SUPPLY" ? "Bill of Supply" : "Tax Invoice"} number={invoice.number} issued={invoice.issueDate} due={invoice.dueDate} seller={seller} buyer={buyerFromSnapshot(invoice.buyerSnapshot as BuyerSnapshot | null, { name: portal.customer.name })} placeOfSupply={invoice.placeOfSupply} lines={storedLines(invoice.linesJson)} terms={invoice.paymentTerms} heads={{ subtotal: invoice.subtotalPaise, cgst: invoice.cgstPaise, sgst: invoice.sgstPaise, igst: invoice.igstPaise, tax: invoice.taxPaise, total: invoice.totalPaise }} />
      <p className="muted">This private link expires {formatDay(portal.expiresAt)}.</p>
    </section></main>;
  }
  if (!quote || quote.status === "DRAFT") notFound();
  const lines = storedLines(quote.linesJson);
  const totals = calculateDocument(lines, quote.taxPaise === 0 ? "NONE" : quote.placeOfSupply && workspace.stateCode && quote.placeOfSupply !== workspace.stateCode ? "INTER" : "INTRA");
  return <main id="main-content" className="portal-page"><section className="portal-wide">
    <p className="eyebrow">{workspace.brandName}</p><h1>Quote {quote.number}</h1><p>Hello {portal.customer.name}, here is our quote. Reply on WhatsApp to go ahead.</p>
    <DocumentView title="Quotation" number={quote.number} issued={quote.createdAt} due={quote.dueDate} seller={{ name: workspace.legalName ?? workspace.name, tradeName: workspace.brandName, address: workspace.address, stateCode: workspace.stateCode, gstin: workspace.gstScheme === "UNREGISTERED" ? null : workspace.gstin }} buyer={{ name: portal.customer.name }} placeOfSupply={quote.placeOfSupply} lines={totals.lines} heads={totals} />
    <p className="muted">This private link expires {formatDay(portal.expiresAt)}.</p>
  </section></main>;
}
