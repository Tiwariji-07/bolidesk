import { notFound } from "next/navigation";
import { InvoiceActions } from "@/components/invoice-actions";
import { PageHeader, Status } from "@/components/ui";
import { formatDate, formatINR } from "@/lib/format";
import { currentWorkspaceId } from "@/server/current-workspace";
import { forWorkspace } from "@/server/persistence";

type Line = { description: string; quantity: number; unitPrice: number; taxRate: number };
export default async function InvoiceDetailPage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const workspace = forWorkspace(await currentWorkspaceId());
  const [invoice, settings] = await Promise.all([workspace.invoices.getByNumber(number), workspace.workspace.get()]);
  if (!invoice || !settings) notFound();
  const lines = invoice.linesJson as unknown as Line[];
  return <><PageHeader eyebrow="Invoice detail" title={invoice.number} action={<InvoiceActions invoiceId={invoice.id} paid={invoice.status === "PAID"} />} /><article className="invoice-paper"><div className="invoice-top"><div><p className="eyebrow">{settings.brandName}</p><h2>Tax Invoice</h2>{settings.gstin && <p className="muted">GSTIN: {settings.gstin}</p>}</div><div className="invoice-meta"><strong>{invoice.number}</strong><br />Issued {formatDate(invoice.createdAt)}<br />Due {invoice.dueDate ? formatDate(invoice.dueDate) : "on receipt"}<br /><br /><Status value={invoice.status} /></div></div><div className="split" style={{ margin: "18px 0" }}><div><p className="eyebrow">Bill to</p><strong>{invoice.customer.name}</strong><br /><span className="muted">{invoice.customer.address ?? "Address not provided"}</span></div><div><p className="eyebrow">Payment terms</p><strong>{invoice.dueDate ? "Due by the date shown" : "Due on receipt"}</strong><br /><span className="muted">UPI / card / bank transfer</span></div></div><div className="data-list">{lines.map((line, index) => <div className="row" key={`${line.description}-${index}`}><div><strong>{line.description}</strong><span>{line.quantity} × {formatINR(line.unitPrice)} · GST {line.taxRate}%</span></div><strong>{formatINR(line.quantity * line.unitPrice)}</strong></div>)}<div className="row"><span>GST</span><strong>{formatINR(invoice.tax)}</strong></div></div><div className="invoice-total"><span>Total payable</span><span>{formatINR(invoice.total)}</span></div></article></>;
}
