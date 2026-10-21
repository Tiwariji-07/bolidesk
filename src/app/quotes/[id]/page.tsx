import Link from "next/link";
import { notFound } from "next/navigation";
import { convertQuoteAction, moveQuoteAction, sharePortalLinkAction } from "@/app/actions";
import { ActionButton } from "@/components/action-button";
import { DocumentView } from "@/components/document-view";
import { LineEditor } from "@/components/line-editor";
import { PrintButton } from "@/components/print-button";
import { PageHeader, Status } from "@/components/ui";
import { toIsoDate } from "@/domain/business-time";
import { ALLOWED_RATES, calculateDocument, type GstScheme } from "@/domain/gst";
import { can, currentAccess } from "@/server/access";
import { storedLines, workspaceMode } from "@/server/billing";
import { getQuote, getWorkspace } from "@/server/queries";

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await currentAccess();
  const [quote, workspace] = await Promise.all([getQuote(access.workspaceId, id), getWorkspace(access.workspaceId)]);
  if (!quote) notFound();
  const lines = storedLines(quote.linesJson);
  const totals = calculateDocument(lines, workspaceMode(workspace, quote.placeOfSupply));
  const actions = <div className="form-actions no-print">
    {quote.status === "DRAFT" && can(access, "quotes.decide") && <ActionButton action={moveQuoteAction.bind(null, quote.id, "SENT")} label="Mark sent" pendingLabel="Saving…" />}
    {quote.status === "SENT" && can(access, "quotes.decide") && <><ActionButton action={moveQuoteAction.bind(null, quote.id, "ACCEPTED")} label="Customer accepted" pendingLabel="Saving…" /><ActionButton variant="secondary" action={moveQuoteAction.bind(null, quote.id, "REJECTED")} label="Customer declined" confirmText="Mark this quote declined? It cannot be reopened." /></>}
    {quote.status !== "DRAFT" && quote.status !== "INVOICED" && can(access, "portal.share") && <ActionButton variant="secondary" action={sharePortalLinkAction.bind(null, { quoteId: quote.id })} label="Customer link" linkLabel="Private quote link, valid 30 days" whatsappText={`Quote ${quote.number} from ${workspace.brandName}:`} />}
    {quote.status === "ACCEPTED" && can(access, "invoices.write") && <ActionButton action={convertQuoteAction.bind(null, quote.id)} label="Create invoice" pendingLabel="Creating…" next="/invoices/{id}" />}
    {quote.invoice && <Link className="button" href={`/invoices/${quote.invoice.id}`}>Open invoice {quote.invoice.number ?? "(draft)"}</Link>}
    {quote.status !== "DRAFT" && <PrintButton />}
  </div>;
  return <><PageHeader eyebrow={`Quote for ${quote.customer.name}`} title={quote.number ?? "Draft quote"} action={<Status value={quote.status} />} />
    {quote.job && <p className="muted">From the job note: “{quote.job.note}”</p>}
    {quote.status === "DRAFT" && can(access, "quotes.draft")
      ? <LineEditor kind="quote" id={quote.id} version={quote.version} lines={lines} dueDate={quote.dueDate ? toIsoDate(quote.dueDate) : null} placeOfSupply={quote.placeOfSupply} seller={{ stateCode: workspace.stateCode, gstScheme: workspace.gstScheme as GstScheme | null, rates: ALLOWED_RATES[workspace.gstRateProfile] }} defaultRate={workspace.defaultTaxRate} defaultCode={workspace.defaultCode} />
      : <DocumentView title="Quotation" number={quote.number} issued={quote.createdAt} due={quote.dueDate} seller={{ name: workspace.legalName ?? workspace.name, tradeName: workspace.brandName, address: workspace.address, stateCode: workspace.stateCode, gstin: workspace.gstScheme === "UNREGISTERED" ? null : workspace.gstin }} buyer={quote.customer} placeOfSupply={quote.placeOfSupply} lines={totals.lines} heads={totals} />}
    {actions}
  </>;
}
