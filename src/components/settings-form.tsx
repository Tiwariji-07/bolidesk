"use client";

import { useState, useTransition } from "react";
import { updateSettingsAction } from "@/app/actions";
import { ALLOWED_RATES, STATES } from "@/domain/gst";

type Settings = { brandName: string; legalName: string | null; address: string | null; stateCode: string | null; gstScheme: string | null; gstin: string | null; gstRateProfile: "REFORM_2025" | "LEGACY_2017"; defaultTaxRate: number; defaultCode: string | null; invoicePrefix: string; upiId: string | null };

export function SettingsForm({ settings, prefixLocked }: { settings: Settings; prefixLocked: boolean }) {
  const [message, setMessage] = useState(""); const [error, setError] = useState(""); const [pending, startTransition] = useTransition();
  const [scheme, setScheme] = useState(settings.gstScheme ?? "");
  const [profile, setProfile] = useState(settings.gstRateProfile);
  function submit(formData: FormData) {
    setMessage(""); setError("");
    const values = Object.fromEntries(["brandName", "legalName", "address", "stateCode", "gstScheme", "gstin", "gstRateProfile", "defaultTaxRate", "defaultCode", "invoicePrefix", "upiId"].map((key) => [key, String(formData.get(key) ?? "")]));
    startTransition(async () => {
      const result = await updateSettingsAction(values as never);
      if (!result.ok) return setError(result.error);
      setMessage("Settings saved.");
    });
  }
  return <form className="panel form-grid" action={submit}>
    <div className="panel-title"><h2>Business details on invoices</h2></div>
    <div className="form-grid two">
      <div className="field"><label htmlFor="brand">Shop name</label><input id="brand" name="brandName" defaultValue={settings.brandName} required /></div>
      <div className="field"><label htmlFor="legal">Legal name (as on GST registration)</label><input id="legal" name="legalName" defaultValue={settings.legalName ?? ""} required /></div>
      <div className="field"><label htmlFor="address">Address</label><input id="address" name="address" defaultValue={settings.address ?? ""} required /></div>
      <div className="field"><label htmlFor="state">State</label><select id="state" name="stateCode" defaultValue={settings.stateCode ?? ""} required><option value="" disabled>Choose</option>{Object.entries(STATES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></div>
      <div className="field"><label htmlFor="scheme">GST registration</label><select id="scheme" name="gstScheme" value={scheme} onChange={(event) => setScheme(event.target.value)} required><option value="" disabled>Choose</option><option value="REGULAR">Registered (regular): charge GST</option><option value="COMPOSITION">Composition scheme: no GST on bills</option><option value="UNREGISTERED">Not registered: no GST</option></select></div>
      {scheme !== "UNREGISTERED" && <div className="field"><label htmlFor="gstin">GSTIN</label><input id="gstin" name="gstin" defaultValue={settings.gstin ?? ""} maxLength={15} autoCapitalize="characters" required /></div>}
      {scheme === "REGULAR" && <>
        <div className="field"><label htmlFor="profile">GST rates in use</label><select id="profile" name="gstRateProfile" value={profile} onChange={(event) => setProfile(event.target.value as Settings["gstRateProfile"])}><option value="REFORM_2025">From 22 Sep 2025: 0, 5, 18, 40%</option><option value="LEGACY_2017">Before the reform: 0, 5, 12, 18, 28%</option></select></div>
        <div className="field"><label htmlFor="rate">Default GST rate</label><select id="rate" name="defaultTaxRate" defaultValue={String(settings.defaultTaxRate)}>{ALLOWED_RATES[profile].map((rate) => <option key={rate} value={rate}>{rate}%</option>)}</select></div>
        <div className="field"><label htmlFor="code">Default SAC/HSN</label><input id="code" name="defaultCode" inputMode="numeric" maxLength={8} defaultValue={settings.defaultCode ?? ""} placeholder="998719 (repair and maintenance)" /></div>
      </>}
      {scheme !== "REGULAR" && <><input type="hidden" name="gstRateProfile" value={profile} /><input type="hidden" name="defaultTaxRate" value="0" /></>}
      <div className="field"><label htmlFor="prefix">Document prefix (1–3 letters)</label><input id="prefix" name="invoicePrefix" defaultValue={settings.invoicePrefix} maxLength={3} required readOnly={prefixLocked} aria-describedby="prefix-help" /><small id="prefix-help" className="muted">{prefixLocked ? "Fixed: numbered documents already use it." : "Invoices look like BDI-2627-000001."}</small></div>
      <div className="field"><label htmlFor="upi">UPI ID for payments</label><input id="upi" name="upiId" defaultValue={settings.upiId ?? ""} placeholder="shopname@okhdfcbank" /></div>
    </div>
    {error && <p className="notice error-notice" role="alert">{error}</p>}{message && <p className="notice" role="status">{message}</p>}
    <div className="form-actions"><button type="submit" disabled={pending}>{pending ? "Saving…" : "Save settings"}</button></div>
  </form>;
}
