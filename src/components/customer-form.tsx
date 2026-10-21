"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCustomerAction, updateCustomerAction } from "@/app/actions";
import { STATES } from "@/domain/gst";

type Customer = { id: string; name: string; phone: string; email: string | null; address: string | null; stateCode: string | null; gstin: string | null };

/** Create (no customer) or edit. On create, `onCreated` lets the job form select the new customer without a reload. */
export function CustomerForm({ customer, defaultState, onCreated, startOpen = false }: { customer?: Customer; defaultState?: string | null; onCreated?: (customer: { id: string; name: string }) => void; startOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(startOpen);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const prefix = customer ? `edit-${customer.id}` : "new-customer";

  function submit(formData: FormData) {
    setError("");
    const values = { name: String(formData.get("name") ?? ""), phone: String(formData.get("phone") ?? ""), email: String(formData.get("email") ?? ""), address: String(formData.get("address") ?? ""), stateCode: String(formData.get("stateCode") ?? ""), gstin: String(formData.get("gstin") ?? "") };
    startTransition(async () => {
      const result = customer ? await updateCustomerAction(customer.id, values) : await createCustomerAction(values);
      if (!result.ok) return setError(result.error);
      if (!customer && result.data && onCreated) onCreated(result.data as { id: string; name: string });
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) return <button type="button" className={customer ? "secondary" : undefined} onClick={() => setOpen(true)}>{customer ? "Edit details" : "+ New customer"}</button>;
  return <section className="panel"><form className="form-grid two" action={submit}>
    <div className="field"><label htmlFor={`${prefix}-name`}>Customer name</label><input id={`${prefix}-name`} name="name" required defaultValue={customer?.name} placeholder="e.g. Priya Iyer" autoComplete="off" /></div>
    <div className="field"><label htmlFor={`${prefix}-phone`}>Mobile number</label><input id={`${prefix}-phone`} name="phone" required inputMode="tel" defaultValue={customer?.phone} placeholder="98765 43210" autoComplete="off" /></div>
    <div className="field"><label htmlFor={`${prefix}-address`}>Address or area</label><input id={`${prefix}-address`} name="address" defaultValue={customer?.address ?? ""} placeholder="e.g. 12, 4th Cross, Jayanagar" /></div>
    <div className="field"><label htmlFor={`${prefix}-state`}>State</label><select id={`${prefix}-state`} name="stateCode" defaultValue={customer?.stateCode ?? defaultState ?? ""}><option value="">Same as my shop</option>{Object.entries(STATES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></div>
    <div className="field"><label htmlFor={`${prefix}-gstin`}>Customer GSTIN (businesses)</label><input id={`${prefix}-gstin`} name="gstin" defaultValue={customer?.gstin ?? ""} placeholder="Optional" autoCapitalize="characters" maxLength={15} /></div>
    <div className="field"><label htmlFor={`${prefix}-email`}>Email</label><input id={`${prefix}-email`} name="email" type="email" defaultValue={customer?.email ?? ""} placeholder="Optional" /></div>
    {error && <p className="notice error-notice" role="alert">{error}</p>}
    <div className="form-actions"><button type="submit" disabled={pending}>{pending ? "Saving…" : "Save customer"}</button><button type="button" className="secondary" disabled={pending} onClick={() => setOpen(false)}>Cancel</button></div>
  </form></section>;
}
