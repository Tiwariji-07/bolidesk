"use client";

import { useState, useTransition } from "react";
import { updateWorkspaceSettings } from "@/app/actions";

export function SettingsForm({ brandName, invoicePrefix, gstin }: { brandName: string; invoicePrefix: string; gstin: string | null }) {
  const [message, setMessage] = useState(""); const [error, setError] = useState(""); const [pending, startTransition] = useTransition();
  function submit(formData: FormData) { setMessage(""); setError(""); startTransition(async () => { const result = await updateWorkspaceSettings({ brandName: formData.get("brandName"), invoicePrefix: formData.get("invoicePrefix"), gstin: formData.get("gstin") }); if (!result.ok) return setError(result.error); setMessage("Settings saved."); }); }
  return <form className="panel form-grid" action={submit}><div className="panel-title"><h2>Business identity</h2></div><div className="field"><label htmlFor="brand">Brand name</label><input id="brand" name="brandName" defaultValue={brandName} required /></div><div className="field"><label htmlFor="prefix">Invoice prefix</label><input id="prefix" name="invoicePrefix" defaultValue={invoicePrefix} required /></div><div className="field"><label htmlFor="gstin">GSTIN</label><input id="gstin" name="gstin" defaultValue={gstin ?? ""} placeholder="29AAAAA0000A1Z5" /></div><div className="field"><label htmlFor="payment">Payment provider</label><select id="payment" defaultValue="mock" disabled><option value="mock">BoliDesk demo payments</option><option value="razorpay">Razorpay (connect later)</option></select></div>{(message || error) && <p className={`notice ${error ? "error-notice" : ""}`} role={error ? "alert" : "status"}>{error || message}</p>}<button disabled={pending}>{pending ? "Saving…" : "Save settings"}</button></form>;
}
