"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPaymentRequest, markInvoicePaid } from "@/app/actions";

export function InvoiceActions({ invoiceId, paid }: { invoiceId: string; paid: boolean }) {
  const router = useRouter(); const [message, setMessage] = useState(""); const [error, setError] = useState(""); const [pending, startTransition] = useTransition();
  function paymentRequest() { startTransition(async () => { setError(""); const result = await createPaymentRequest(invoiceId); if (!result.ok) return setError(result.error); if (!result.data) return setError("Payment link was not created."); setMessage(`Payment link ready: ${result.data.url}`); router.refresh(); }); }
  function markPaid() { startTransition(async () => { setError(""); const result = await markInvoicePaid(invoiceId); if (!result.ok) return setError(result.error); setMessage("Payment recorded."); router.refresh(); }); }
  return <>{(error || message) && <p className={`notice ${error ? "error-notice" : ""}`} role={error ? "alert" : "status"}>{error || message}</p>}<div className="form-actions no-print"><button className="secondary" onClick={() => window.print()}>Print</button>{!paid && <><button onClick={paymentRequest} disabled={pending}>{pending ? "Preparing…" : "Create payment request"}</button><button onClick={markPaid} disabled={pending}>{pending ? "Saving…" : "Record payment"}</button></>}</div></>;
}
