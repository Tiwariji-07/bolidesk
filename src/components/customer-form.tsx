"use client";

import { useState, useTransition } from "react";
import { createCustomer } from "@/app/actions";

export function CustomerForm() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError("");
    startTransition(async () => {
      const result = await createCustomer({
        name: formData.get("name"), phone: formData.get("phone"),
        address: formData.get("address"), email: formData.get("email"),
      });
      if (!result.ok) return setError(result.error);
      setOpen(false);
    });
  }

  return <>
    <button onClick={() => { setOpen((value) => !value); setError(""); }}>+ New customer</button>
    {open && <section className="panel"><form className="form-grid two" action={submit}>
      <div className="field"><label htmlFor="name">Customer name</label><input id="name" name="name" required placeholder="e.g. Priya Iyer" /></div>
      <div className="field"><label htmlFor="phone">Mobile number</label><input id="phone" name="phone" required placeholder="+91 98…" /></div>
      <div className="field"><label htmlFor="area">Area</label><input id="area" name="address" placeholder="e.g. Jayanagar" /></div>
      <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" placeholder="Optional" /></div>
      {error && <p className="notice error-notice" role="alert">{error}</p>}
      <div className="form-actions"><button type="submit" disabled={pending}>{pending ? "Saving…" : "Save customer"}</button><button type="button" className="secondary" disabled={pending} onClick={() => setOpen(false)}>Cancel</button></div>
    </form></section>}
  </>;
}
