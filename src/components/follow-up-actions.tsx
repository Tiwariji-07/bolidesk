"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeFollowUp, snoozeFollowUp } from "@/app/actions";

export function FollowUpActions({ id }: { id: string }) {
  const router = useRouter(); const [error, setError] = useState(""); const [pending, startTransition] = useTransition();
  function update(action: "done" | "snooze") { startTransition(async () => { setError(""); const result = action === "done" ? await completeFollowUp(id) : await snoozeFollowUp(id); if (!result.ok) return setError(result.error); router.refresh(); }); }
  return <div>{error && <p className="inline-error" role="alert">{error}</p>}<div className="form-actions"><button className="small" disabled={pending} onClick={() => update("done")}>{pending ? "Saving…" : "Mark done"}</button><button className="secondary small" disabled={pending} onClick={() => update("snooze")}>Snooze</button></div></div>;
}
