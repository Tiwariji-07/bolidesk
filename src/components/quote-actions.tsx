"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changeQuoteStatus, convertQuoteToInvoice } from "@/app/actions";

export function QuoteActions({ id, status }: { id: string; status: string }) {
  const router = useRouter(); const [error, setError] = useState(""); const [pending, startTransition] = useTransition();
  const run = (operation: "SENT" | "ACCEPTED" | "REJECTED" | "invoice") => startTransition(async () => {
    setError(""); const result = operation === "invoice" ? await convertQuoteToInvoice(id) : await changeQuoteStatus(id, operation);
    if (!result.ok) return setError(result.error);
    if (operation === "invoice") { if (!result.data) return setError("Invoice could not be created."); return router.push(`/invoices/${result.data.number}`); }
    router.refresh();
  });
  return <div className="quote-actions">{status === "DRAFT" && <button className="button small" disabled={pending} onClick={() => run("SENT")}>{pending ? "Sending…" : "Send"}</button>}{status === "SENT" && <><button className="button small" disabled={pending} onClick={() => run("ACCEPTED")}>{pending ? "Saving…" : "Accept"}</button><button className="button secondary small" disabled={pending} onClick={() => run("REJECTED")}>Reject</button></>}{status === "ACCEPTED" && <button className="button small" disabled={pending} onClick={() => run("invoice")}>{pending ? "Creating…" : "Create invoice"}</button>}{error && <p className="inline-error" role="alert">{error}</p>}</div>;
}
