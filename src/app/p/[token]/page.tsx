import { notFound } from "next/navigation";
import { formatDate, formatINR } from "@/lib/format";
import { resolvePortalToken } from "@/server/portal";

export default async function CustomerPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await resolvePortalToken(token);
  if (!portal) notFound();
  const document = portal.invoice ?? portal.quote;
  if (!document) notFound();
  const paid = portal.invoice?.status === "PAID";
  return <main className="portal-page"><section className="portal-card"><p className="eyebrow">BoliDesk customer portal</p><h1>{paid ? "Payment received" : portal.invoice ? "Invoice ready" : "Quote ready"}</h1><p>Hello {portal.customer.name}, here is your {portal.invoice ? "invoice" : "quote"}.</p><div className="portal-summary"><span>{document.number}</span><strong>{formatINR(document.total)}</strong></div>{document.dueDate && <p>Due {formatDate(document.dueDate)}.</p>}{portal.invoice && !paid && portal.invoice.paymentUrl && <a className="button-link" href={portal.invoice.paymentUrl}>Pay securely</a>}<p className="muted">This private link expires {formatDate(portal.expiresAt)}.</p></section></main>;
}
