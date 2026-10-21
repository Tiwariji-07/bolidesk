"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignJobCustomerAction, createQuoteFromJobAction, saveJobAction } from "@/app/actions";
import type { ParsedJobNote } from "@/domain/job-note";
import { formatINR } from "@/lib/format";
import { CustomerForm } from "./customer-form";

type Customer = { id: string; name: string };

export function JobCaptureForm({ customers: initialCustomers, parserName, canQuote, defaultState }: { customers: Customer[]; parserName: string; canQuote: boolean; defaultState: string | null }) {
  const router = useRouter();
  const [customers, setCustomers] = useState(initialCustomers);
  const [note, setNote] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [saved, setSaved] = useState<{ id: string; parsed: ParsedJobNote; customerId: string } | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  // A suggestion only: the parsed name is matched against existing customers, never auto-assigned.
  const suggestion = useMemo(() => {
    const name = saved?.parsed.customerName?.toLowerCase();
    return name && !customerId ? customers.find((customer) => customer.name.toLowerCase().startsWith(name) || name.startsWith(customer.name.toLowerCase())) : undefined;
  }, [saved, customerId, customers]);

  const edit = (apply: () => void) => { apply(); setSaved(null); setError(""); };

  /** Choosing a customer after the note was saved attaches them to that job instead of saving a duplicate. */
  function chooseCustomer(id: string) {
    setCustomerId(id); setError("");
    if (!saved || !id) return setSaved(saved && !id ? null : saved);
    startTransition(async () => {
      const result = await assignJobCustomerAction(saved.id, id);
      if (!result.ok) return setError(result.error);
      setSaved({ ...saved, customerId: id });
    });
  }

  function read() {
    setError("");
    startTransition(async () => {
      const result = await saveJobAction({ note, customerId: customerId || undefined });
      if (!result.ok) return setError(result.error);
      setSaved({ id: result.data!.id, parsed: result.data!.parsed as ParsedJobNote, customerId });
      router.refresh();
    });
  }

  function makeQuote() {
    if (!saved) return;
    setError("");
    startTransition(async () => {
      const result = await createQuoteFromJobAction(saved.id);
      if (!result.ok) return setError(result.error);
      router.push(`/quotes/${result.data!.id}`);
    });
  }

  const total = saved?.parsed.lines.reduce((sum, line) => sum + Math.round(line.unitPrice * line.quantity), 0) ?? 0;
  return <section className="split">
    <div className="panel"><div className="panel-title"><h2>What needs doing?</h2><span>{parserName === "openai" ? "Read by AI, you check it" : "Read on this server"}</span></div>
      <div className="field"><label htmlFor="customer">Customer</label><select id="customer" value={customerId} onChange={(event) => chooseCustomer(event.target.value)}><option value="">Choose a customer</option>{customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.name}</option>)}</select></div>
      <div className="form-actions" style={{ margin: "8px 0 12px" }}><CustomerForm defaultState={defaultState} onCreated={(customer) => { setCustomers((current) => [...current, customer]); chooseCustomer(customer.id); }} /></div>
      <div className="field"><label htmlFor="note">Job note or voice-note transcript</label><textarea id="note" value={note} onChange={(event) => edit(() => setNote(event.target.value))} placeholder="Ravi Sharma, 2 AC services at 650 each, gas refill ₹2,500, GST 18%, due 30 Nov 2026" /></div>
      {error && <p className="notice error-notice" role="alert">{error}</p>}
      <div className="form-actions"><button onClick={read} disabled={pending || note.trim().length < 8}>{pending && !saved ? "Reading…" : "Save and read note"}</button></div>
    </div>
    <div className="panel" aria-live="polite"><div className="panel-title"><h2>What we read</h2><span>You can change everything on the quote</span></div>
      {saved ? <div className="data-list">
        {saved.parsed.lines.length ? saved.parsed.lines.map((line, index) => <div className="row" key={index}><div><strong>{line.description}</strong><span>{line.quantity} × {formatINR(line.unitPrice)}{line.taxRate === null ? " · GST not said" : ` · GST ${line.taxRate}%`}</span></div><strong>{formatINR(Math.round(line.unitPrice * line.quantity))}</strong></div>) : <p className="muted">No prices found in the note. You can add lines on the quote.</p>}
        <div className="row"><div><span>Due</span><strong>{saved.parsed.dueDate ?? "Not said"}</strong></div><div className="row-end"><span>Before tax</span><strong>{formatINR(total)}</strong></div></div>
        {suggestion && <p className="notice">The note mentions {saved.parsed.customerName}. <button type="button" className="secondary small" onClick={() => chooseCustomer(suggestion.id)}>Use {suggestion.name}</button></p>}
        {!saved.customerId && <p className="notice">Choose the customer above to make a quote.</p>}
        {canQuote && saved.customerId && <div className="form-actions"><button onClick={makeQuote} disabled={pending}>{pending ? "Creating…" : "Make draft quote"}</button></div>}
      </div> : <p className="muted">Write the job the way you would on WhatsApp. Prices like 650, Rs 1,200 or ₹2,500.50 and several items work.</p>}
    </div>
  </section>;
}
