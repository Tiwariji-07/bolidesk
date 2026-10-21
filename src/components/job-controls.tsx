"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignJobCustomerAction, createQuoteFromJobAction, scheduleJobAction, setJobStatusAction } from "@/app/actions";

type Member = { id: string; label: string };

/** Office: assign and schedule. Everyone: mark their visit done. The office can also cancel or reopen. */
/** A saved job can be picked up later: attach its customer and make the draft quote from here. */
export function JobQuoteControls({ jobId, hasCustomer, customers }: { jobId: string; hasCustomer: boolean; customers: { id: string; name: string }[] }) {
  const router = useRouter(); const [error, setError] = useState(""); const [pending, startTransition] = useTransition();
  if (hasCustomer) return <div className="action-button"><button className="small" disabled={pending} onClick={() => startTransition(async () => { setError(""); const result = await createQuoteFromJobAction(jobId); if (!result.ok) return setError(result.error); router.push(`/quotes/${result.data!.id}`); })}>{pending ? "Creating…" : "Make draft quote"}</button>{error && <p className="inline-error" role="alert">{error}</p>}</div>;
  return <div className="action-button"><label className="sr-only" htmlFor={`customer-${jobId}`}>Customer for this job</label><select id={`customer-${jobId}`} defaultValue="" disabled={pending} onChange={(event) => { const id = event.target.value; if (id) startTransition(async () => { setError(""); const result = await assignJobCustomerAction(jobId, id); if (!result.ok) return setError(result.error); router.refresh(); }); }}><option value="" disabled>Choose the customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select>{error && <p className="inline-error" role="alert">{error}</p>}</div>;
}

export function JobControls({ jobId, status, assigneeId, visit, members, office, mine }: { jobId: string; status: string; assigneeId: string | null; visit: string | null; members: Member[]; office: boolean; mine: boolean }) {
  const router = useRouter(); const [error, setError] = useState(""); const [pending, startTransition] = useTransition();
  const run = (body: () => Promise<{ ok: boolean; error?: string }>) => startTransition(async () => { setError(""); const result = await body(); if (!result.ok) return setError(result.error ?? "Could not save."); router.refresh(); });
  const closed = status === "DONE" || status === "CANCELLED";
  return <div className="job-controls">
    {office && !closed && <form className="form-actions" action={(formData) => run(() => scheduleJobAction(jobId, { assigneeUserId: String(formData.get("assignee") ?? ""), visit: String(formData.get("visit") ?? "") }))}>
      <label className="sr-only" htmlFor={`assignee-${jobId}`}>Technician</label>
      <select id={`assignee-${jobId}`} name="assignee" defaultValue={assigneeId ?? ""}><option value="">Not assigned</option>{members.map((member) => <option key={member.id} value={member.id}>{member.label}</option>)}</select>
      <label className="sr-only" htmlFor={`visit-${jobId}`}>Visit time (IST)</label>
      <input id={`visit-${jobId}`} name="visit" type="datetime-local" defaultValue={visit ?? ""} />
      <button className="secondary small" disabled={pending}>Save</button>
    </form>}
    <div className="form-actions">
      {!closed && (office || mine || !assigneeId) && <button className="small" disabled={pending} onClick={() => run(() => setJobStatusAction(jobId, "DONE"))}>Visit done</button>}
      {office && !closed && <button className="secondary small" disabled={pending} onClick={() => { if (confirm("Cancel this job?")) run(() => setJobStatusAction(jobId, "CANCELLED")); }}>Cancel job</button>}
      {office && closed && <button className="secondary small" disabled={pending} onClick={() => run(() => setJobStatusAction(jobId, "OPEN"))}>Reopen</button>}
    </div>
    {error && <p className="inline-error" role="alert">{error}</p>}
  </div>;
}
