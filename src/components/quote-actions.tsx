"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changeQuoteStatus, convertQuoteToInvoice, createQuotePortalLink } from "@/app/actions";

export function QuoteActions({ id, status }: { id: string; status: string }) {
  const router = useRouter(); const [error, setError] = useState(""); const [message, setMessage] = useState(""); const [pending, startTransition] = useTransition();
  const run = (operation: "SENT" | "ACCEPTED" | "REJECTED" | "invoice" | "portal") => startTransition(async () => {
    setError(""); setMessage("");
    if (operation === "portal") { const portal = await createQuotePortalLink(id); if (!portal.ok || !portal.data) return setError(portal.ok ? "Portal link could not be created." : portal.error); return setMessage(`Secure link: ${portal.data.url}`); }
    const result = operation === "invoice" ? await convertQuoteToInvoice(id) : await changeQuoteStatus(id, operation);
    if (!result.ok) return setError(result.error);
    if (operation === "invoice") { if (!result.data) return setError("Invoice could not be created."); return router.push(`/invoices/${result.data.number}`); }
    router.refresh();
  });
  return <div className="quote-actions"><button className="button secondary small" disabled={pending} onClick={() => run("portal")}>Share secure link</button>{status === "DRAFT" && <button className="button small" disabled={pending} onClick={() => run("SENT")}>{pending ? "Sending…" : "Send"}</button>}{status === "SENT" && <><button className="button small" disabled={pending} onClick={() => run("ACCEPTED")}>{pending ? "Saving…" : "Accept"}</button><button className="button secondary small" disabled={pending} onClick={() => run("REJECTED")}>Reject</button></>}{status === "ACCEPTED" && <button className="button small" disabled={pending} onClick={() => run("invoice")}>{pending ? "Creating…" : "Create invoice"}</button>}{(error || message) && <p className="inline-error" role={error ? "alert" : "status"}>{error || message}</p>}</div>;
}
