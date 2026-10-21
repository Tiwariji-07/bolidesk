import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { PageHeader } from "@/components/ui";
import { formatDate, formatINR, formatTime } from "@/lib/format";
import { currentAccess } from "@/server/access";
import type { SellerSnapshot } from "@/server/billing";
import { getPrisma } from "@/server/prisma";

export default async function ReceiptPage({ params }: { params: Promise<{ id: string; paymentId: string }> }) {
  const { id, paymentId } = await params;
  const access = await currentAccess();
  const payment = await getPrisma().payment.findFirst({ where: { id: paymentId, invoiceId: id, workspaceId: access.workspaceId, entryKind: "RECEIPT" }, include: { invoice: { include: { customer: { select: { name: true } } } }, recordedBy: { select: { name: true, email: true } } } });
  if (!payment || !payment.receiptNumber) notFound();
  const seller = payment.invoice.sellerSnapshot as SellerSnapshot | null;
  return <><PageHeader eyebrow="Payment receipt" title={payment.receiptNumber} action={<div className="form-actions no-print"><Link className="button secondary" href={`/invoices/${id}`}>Back to invoice</Link><PrintButton /></div>} />
    <article className="invoice-paper"><div className="invoice-top"><div><p className="eyebrow">{seller?.tradeName}</p><h2>Receipt</h2><p className="muted">{seller?.legalName}{seller?.gstin ? <><br />GSTIN: {seller.gstin}</> : null}</p></div><div className="invoice-meta"><strong>{payment.receiptNumber}</strong><br />{formatDate(payment.occurredAt)}, {formatTime(payment.occurredAt)}</div></div>
      <p style={{ fontSize: 18 }}>Received <strong>{formatINR(payment.amountPaise)}</strong> from <strong>{payment.invoice.customer.name}</strong> against invoice <strong>{payment.invoice.number}</strong> by {payment.method?.toLowerCase()}{payment.reference ? ` (ref. ${payment.reference})` : ""}.</p>
      {payment.recordedBy && <p className="muted">Recorded by {payment.recordedBy.name ?? payment.recordedBy.email}.</p>}
    </article></>;
}
