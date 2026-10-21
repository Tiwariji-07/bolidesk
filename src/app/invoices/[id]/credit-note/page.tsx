import { notFound } from "next/navigation";
import { buyerFromSnapshot, DocumentView, sellerFromSnapshot } from "@/components/document-view";
import { PrintButton } from "@/components/print-button";
import { PageHeader } from "@/components/ui";
import { formatDay } from "@/lib/format";
import { currentAccess } from "@/server/access";
import { storedLines, type BuyerSnapshot, type SellerSnapshot } from "@/server/billing";
import { getPrisma } from "@/server/prisma";

export default async function CreditNotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await currentAccess();
  const note = await getPrisma().creditNote.findFirst({ where: { invoiceId: id, workspaceId: access.workspaceId }, include: { invoice: { include: { customer: true } }, workspace: true } });
  if (!note) notFound();
  const { invoice } = note;
  return <><PageHeader eyebrow={`Cancels invoice ${invoice.number}`} title={note.number} action={<div className="no-print"><PrintButton /></div>} />
    <DocumentView title="Credit Note" number={note.number} issued={note.issueDate} seller={sellerFromSnapshot(invoice.sellerSnapshot as SellerSnapshot | null, { name: note.workspace.legalName ?? note.workspace.name, brandName: note.workspace.brandName })} buyer={buyerFromSnapshot(invoice.buyerSnapshot as BuyerSnapshot | null, invoice.customer)} placeOfSupply={invoice.placeOfSupply} lines={storedLines(note.linesJson)}
      heads={{ subtotal: note.subtotalPaise, cgst: note.cgstPaise, sgst: note.sgstPaise, igst: note.igstPaise, tax: note.taxPaise, total: note.totalPaise }}
      footer={<p>Against invoice <strong>{invoice.number}</strong> dated {invoice.issueDate ? formatDay(invoice.issueDate) : "unknown"}. Reason: {note.reason}</p>} />
  </>;
}
