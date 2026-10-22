"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeFollowUpAction, createFollowUpAction, snoozeFollowUpAction } from "@/app/actions";

export function FollowUpActions({ id }: { id: string }) {
  const router = useRouter(); const [error, setError] = useState(""); const [pending, startTransition] = useTransition();
  function update(action: "done" | "snooze") { startTransition(async () => { setError(""); const result = action === "done" ? await completeFollowUpAction(id) : await snoozeFollowUpAction(id); if (!result.ok) return setError(result.error); router.refresh(); }); }
  return <div>{error && <p className="inline-error" role="alert">{error}</p>}<div className="form-actions"><button className="small" disabled={pending} onClick={() => update("done")}>{pending ? "Saving…" : "Mark done"}</button><button className="secondary small" disabled={pending} onClick={() => update("snooze")}>Tomorrow 9 am</button></div></div>;
}

export function NewFollowUpForm({ today }: { today: string }) {
  const router = useRouter(); const [error, setError] = useState(""); const [pending, startTransition] = useTransition(); const [open, setOpen] = useState(false);
  function submit(formData: FormData) {
    setError("");
    // The date input is an IST calendar day; remind at 9:00 IST that day.
    const due = String(formData.get("dueAt") ?? "");
    startTransition(async () => {
      const result = await createFollowUpAction({ subject: formData.get("subject"), action: formData.get("action"), dueAt: due ? `${due}T09:00:00+05:30` : "" });
      if (!result.ok) return setError(result.error);
      setOpen(false); router.refresh();
    });
  }
  if (!open) return <button onClick={() => setOpen(true)}>+ New follow-up</button>;
  return <section className="panel"><form className="form-grid two" action={submit}>
    <div className="field"><label htmlFor="fu-subject">About</label><input id="fu-subject" name="subject" required minLength={3} placeholder="Meera Nair, AC installation" /></div>
    <div className="field"><label htmlFor="fu-due">When</label><input id="fu-due" name="dueAt" type="date" required min={today} defaultValue={today} /></div>
    <div className="field"><label htmlFor="fu-action">What to do</label><input id="fu-action" name="action" required minLength={3} placeholder="Call to confirm the visit time" /></div>
    {error && <p className="notice error-notice" role="alert">{error}</p>}
    <div className="form-actions"><button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</button><button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button></div>
  </form></section>;
}
