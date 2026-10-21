"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { recordPaymentAction, recordRefundAction, reversePaymentAction } from "@/app/actions";
import { paiseToRupeeInput } from "@/domain/money";
import { useDraftGuard } from "./draft-guard";

const METHODS = [["CASH", "Cash"], ["UPI", "UPI (direct)"], ["CARD", "Card machine"], ["BANK", "Bank transfer"]] as const;

/** Each opened form gets its own key, so a double tap or a retry after a timeout records the payment once. */
export function RecordPaymentForm({ invoiceId, duePaise, allowNonCash, draftVersion }: { invoiceId: string; duePaise: number; allowNonCash: boolean; draftVersion?: number }) {
  const guard = useDraftGuard();
  const draft = draftVersion !== undefined;
  const blocked = draft && Boolean(guard?.dirty);
  const router = useRouter();
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [method, setMethod] = useState("CASH");
  const [error, setError] = useState(""); const [done, setDone] = useState<{ number: string; paymentId: string } | null>(null);
  const [pending, startTransition] = useTransition();
  function submit(formData: FormData) {
    setError(""); setDone(null);
    startTransition(async () => {
      const result = await recordPaymentAction({ invoiceId, amount: String(formData.get("amount") ?? ""), method, reference: String(formData.get("reference") ?? ""), idempotencyKey: key, draftVersion });
      if (!result.ok) return setError(result.error);
      const receipt = { number: result.data?.receiptNumber ?? "", paymentId: result.data?.paymentId ?? "" };
      // Fully paid: this form goes away with the balance, so take the collector straight to the receipt.
      if (result.data?.duePaise === 0) return router.push(`/invoices/${invoiceId}/receipts/${receipt.paymentId}`);
      setDone(receipt);
      setKey(crypto.randomUUID());
      router.refresh();
    });
  }
  return <form className="form-grid two" action={submit}>
    <div className="field"><label htmlFor="pay-amount">Amount received (₹)</label><input id="pay-amount" name="amount" inputMode="decimal" required defaultValue={paiseToRupeeInput(duePaise)} key={duePaise} /></div>
    <div className="field"><label htmlFor="pay-method">How</label><select id="pay-method" value={method} onChange={(event) => setMethod(event.target.value)}>{METHODS.filter(([value]) => value === "CASH" || (allowNonCash && !draft)).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
    {method !== "CASH" && <div className="field"><label htmlFor="pay-ref">UPI / bank reference</label><input id="pay-ref" name="reference" required placeholder="UTR or transaction ID" /></div>}
    {error && <p className="notice error-notice" role="alert">{error}</p>}{done && <p className="notice" role="status">Receipt {done.number} recorded. <Link className="text-link-ink" href={`/invoices/${invoiceId}/receipts/${done.paymentId}`}>Open receipt</Link></p>}
    <div className="form-actions"><button type="submit" disabled={pending || blocked}>{pending ? "Recording…" : draft ? "Issue and record cash" : "Record payment"}</button>{blocked && <span className="muted">Save the draft first: cash issues the saved version.</span>}</div>
  </form>;
}

export function ReverseReceiptButton({ paymentId, invoiceId }: { paymentId: string; invoiceId: string }) {
  const router = useRouter(); const [error, setError] = useState(""); const [pending, startTransition] = useTransition();
  return <span>{error && <span className="inline-error" role="alert">{error}</span>}<button type="button" className="secondary small" disabled={pending} onClick={() => {
    const reason = prompt("Why reverse this receipt? (e.g. recorded on the wrong invoice)");
    if (!reason) return;
    startTransition(async () => { const result = await reversePaymentAction(paymentId, invoiceId, reason); if (!result.ok) return setError(result.error); router.refresh(); });
  }}>Reverse</button></span>;
}

export function RefundForm({ invoiceId, refundDuePaise }: { invoiceId: string; refundDuePaise: number }) {
  const router = useRouter(); const [error, setError] = useState(""); const [pending, startTransition] = useTransition();
  const [key, setKey] = useState(() => crypto.randomUUID());
  function submit(formData: FormData) {
    setError("");
    startTransition(async () => {
      const result = await recordRefundAction({ invoiceId, amount: String(formData.get("amount")), method: String(formData.get("method")) as "CASH", reference: String(formData.get("reference") ?? ""), reason: String(formData.get("reason") ?? ""), idempotencyKey: key });
      if (!result.ok) return setError(result.error);
      setKey(crypto.randomUUID());
      router.refresh();
    });
  }
  return <form className="form-grid two" action={submit}>
    <div className="field"><label htmlFor="ref-amount">Refunded (₹)</label><input id="ref-amount" name="amount" inputMode="decimal" defaultValue={paiseToRupeeInput(refundDuePaise)} required /></div>
    <div className="field"><label htmlFor="ref-method">How</label><select id="ref-method" name="method">{METHODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
    <div className="field"><label htmlFor="ref-reference">Reference</label><input id="ref-reference" name="reference" /></div>
    <div className="field"><label htmlFor="ref-reason">Reason</label><input id="ref-reason" name="reason" required minLength={3} /></div>
    {error && <p className="notice error-notice" role="alert">{error}</p>}
    <div className="form-actions"><button type="submit" className="secondary" disabled={pending}>{pending ? "Saving…" : "Record refund"}</button></div>
  </form>;
}
