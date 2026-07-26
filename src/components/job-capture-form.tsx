"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createQuoteFromJob, parseAndSaveJob } from "@/app/actions";
import { formatINR } from "@/lib/format";

type Customer = { id: string; name: string };
type Parsed = { customerName?: string; dueDate?: string; paymentTerms?: string; lines: { description: string; quantity: number; unitPrice: number; taxRate: number }[] };

export function JobCaptureForm({ customers }: { customers: Customer[] }) {
  const router = useRouter();
  const [note, setNote] = useState("Ravi Sharma, 2 AC services at 650 each, GST 18%, due 30 July 2026");
  const [customerId, setCustomerId] = useState("");
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [jobId, setJobId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function saveJob() {
    setError(""); setMessage("");
    startTransition(async () => {
      const result = await parseAndSaveJob({ note, customerId: customerId || undefined });
      if (!result.ok) return setError(result.error);
      if (!result.data) return setError("Job could not be saved.");
      setJobId(result.data.id); setParsed(result.data.parsed as Parsed); setMessage("Job parsed and saved. It will still be here after refresh.");
      router.refresh();
    });
  }
  function createQuote() {
    setError(""); setMessage("");
    startTransition(async () => {
      const result = await createQuoteFromJob(jobId);
      if (!result.ok) return setError(result.error);
      router.push("/quotes"); router.refresh();
    });
  }
  const subtotal = parsed?.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0) ?? 0;
  const tax = parsed?.lines.reduce((sum, line) => sum + Math.round(line.quantity * line.unitPrice * line.taxRate / 100), 0) ?? 0;

  return <section className="split"><div className="panel"><div className="panel-title"><h2>Voice-note transcript or typed note</h2><span>Local parser</span></div>
    <div className="field"><label htmlFor="customer">Customer</label><select id="customer" value={customerId} onChange={(event) => setCustomerId(event.target.value)}><option value="">Choose a customer to make a quote</option>{customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.name}</option>)}</select></div>
    <div className="field"><label htmlFor="note">What needs doing?</label><textarea id="note" value={note} onChange={(event) => setNote(event.target.value)} /></div>
    {error && <p className="notice error-notice" role="alert">{error}</p>}{message && <p className="notice" role="status">{message}</p>}
    <div className="form-actions"><button onClick={saveJob} disabled={pending}>{pending ? "Saving…" : "Parse & save job"}</button><span className="muted">Your note stays in this workspace.</span></div>
  </div><div className="panel"><div className="panel-title"><h2>Structured details</h2><span>Saved with the job</span></div>
    {parsed ? <div className="data-list"><div className="row"><div><span>Customer</span><strong>{parsed.customerName || customers.find((customer) => customer.id === customerId)?.name || "Not assigned"}</strong></div></div>{parsed.lines.map((line, index) => <div className="row" key={`${line.description}-${index}`}><div><strong>{line.description}</strong><span>{line.quantity} × {formatINR(line.unitPrice)} · GST {line.taxRate}%</span></div><strong>{formatINR(line.quantity * line.unitPrice)}</strong></div>)}<div className="row"><div><span>Due date</span><strong>{parsed.dueDate ?? "On receipt"}</strong></div></div><div className="invoice-total"><span>Quote total</span><span>{formatINR(subtotal + tax)}</span></div><div className="form-actions"><button onClick={createQuote} disabled={pending || !customerId}>{pending ? "Creating…" : "Create draft quote"}</button></div></div> : <p className="muted">Save a note to review the customer, services, GST and due date here.</p>}
  </div></section>;
}
