"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { issueCreditNoteAction } from "@/app/actions";

export function CreditNoteButton({ invoiceId, version, number }: { invoiceId: string; version: number; number: string }) {
  const router = useRouter(); const [error, setError] = useState(""); const [pending, startTransition] = useTransition();
  return <div className="action-button"><button type="button" className="secondary" disabled={pending} onClick={() => {
    const reason = prompt(`Cancel ${number} with a credit note? This cannot be undone.\n\nReason (printed on the credit note):`);
    if (!reason) return;
    startTransition(async () => { const result = await issueCreditNoteAction(invoiceId, version, reason); if (!result.ok) return setError(result.error); router.refresh(); });
  }}>{pending ? "Issuing…" : "Cancel with credit note"}</button>{error && <p className="inline-error" role="alert">{error}</p>}</div>;
}
